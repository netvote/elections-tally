const protobuf = require("protobufjs");
const crypto = require('crypto');
const IPFS = require('ipfs-mini');
const ursa = require('ursa');
const ipfs = new IPFS({ host: 'gateway.ipfs.io', port: 443, protocol: 'https' });

Array.prototype.pushArray = function (arr) {
    this.push.apply(this, arr);
};

const nv = require('./netvote-eth');

let web3;
let protoPath = "./vote.proto";

// contract references
let BasicElection;
let TieredElection;
let TieredBallot;
let TieredPool;
let BaseBallot;
let BasePool;
let BaseElection;


/**
 * Wrapper function that tallies results for a ballot
 * @param {object} params - object containing all required parameters
 * @param {string} params.electionAddress - the address of the ballot to tally
 * @param {string} params.provider - the url of the provider of the remote node (default: localhost:9545)
 * @param {string} params.resultsUpdateCallback - each vote will invoke this callback w/results (for ui)
 * @returns {Promise}
 */
const tallyElection = async (params) => {
    await initTally(params);
    let election = await TieredElection.at(params.electionAddress);
    let electionType = await election.electionType();
    if (params.protoPath) {
        protoPath = params.protoPath
    }
    switch (electionType) {
        case "TIERED":
            return tallyTieredElection(params);
        case "BASIC":
            return tallyBasicElection(params);
        default:
            throw Error("invalid election type: " + electionType);
    }
};

const tallyTieredElection = async (params) => {
    let Vote = await voteProto();
    let election = await TieredElection.at(params.electionAddress);
    let key = await election.privateKey();

    let results = {
        election: params.electionAddress,
        ballots: {}
    };

    let poolCount = await election.getPoolCount();
    for (let p = 0; p < poolCount; p++) {
        let poolAddress = await election.getPool(p);
        let pool = await TieredPool.at(poolAddress);
        let ballotCount = await pool.getBallotCount();

        

        for (let b = 0; b < ballotCount; b++) {
            let ballotAddress = await pool.getBallot(b);
            let ballot = await TieredBallot.at(ballotAddress);
            let poolGroups = await getGroupsForPool(ballot, poolAddress);
            let voteCount = await pool.getVoteCount();
            let metadata = await getIpfsBallot(ballot);

            if (!results.ballots[ballotAddress]) {
                results.ballots[ballotAddress] = {
                    totalVotes: 0,
                    decisionMetadata: metadata.decisions,
                    ballotTitle: metadata.title,
                    results: {}
                };
            }

            for (let i = 0; i < voteCount; i++) {
                try {
                    let encrypted = await pool.getVoteAt(i);
                    let encoded = decrypt(encrypted, key);
                    let buff = Buffer.from(encoded, 'utf8');
                    let vote = Vote.decode(buff);
                    if(params.validateSignatures){
                        let proof = await pool.getProofAt(i);
                        await validateSignature(Vote, vote, proof)
                    }
                    validateBallotCount(vote, ballotCount);

                    let choices = vote.ballotVotes[0].choices;
                    validateChoices(choices, metadata.decisions)

                   
                    poolGroups.forEach((group, pgi) => {
                        if (!results.ballots[ballotAddress].results[group]) {
                            results.ballots[ballotAddress].results[group] = []
                        }
                        results = tallyVote(choices, ballotAddress, group, results, metadata);
                    });
                    params.resultsUpdateCallback({
                        status: "tallying",
                        progress: {
                            poolIndex: p,
                            poolTotal: parseInt(poolCount),
                            poolBallotIndex: b,
                            poolBallotTotal: parseInt(ballotCount),
                            poolVoterIndex: i,
                            poolVoterTotal: parseInt(voteCount)
                        },
                        results: results
                    });
                
                } catch (e) {
                    console.error(e);
                    params.badVoteCallback({
                        "pool": poolAddress,
                        "reason": e.message,
                        "index": i
                    })
                }
            }
        }
    }

    return results;
};

const tallyTxVote = async (params) => {
    await initTally(params);
    const Vote = await voteProto();
    const txId = params.txId;
    const election = await BaseElection.at(params.electionAddress);
    const key = await election.privateKey();

    if (!key) {
        throw "Vote is encrypted until Election Close";
    }

    let voteObj = await nv.extractVoteFromTx(txId, params.version);

    let results = {
        election: params.electionAddress,
        ballots: {},
        passphrase: voteObj.passphrase
    };

    const pool = await BasePool.at(voteObj.pool);

    let encrypted = await pool.votes(voteObj.voteId);
    let encoded = decrypt(encrypted, key);
    let buff = Buffer.from(encoded, 'utf8');
    let vote = Vote.decode(buff);

    let ballotCount = await pool.getBallotCount();

    validateBallotCount(vote, parseInt(ballotCount))

    for (let i = 0; i < ballotCount; i++) {

        let choices = vote.ballotVotes[i].choices;
        let ballotAddress = await pool.getBallot(i);

        let ballot = await BaseBallot.at(ballotAddress);
        let metadata = await getIpfsBallot(ballot);

        results.ballots[ballotAddress] = {
            totalVotes: 1,
            decisionMetadata: metadata.decisions,
            ballotTitle: metadata.title,
            results: { "ALL": [] }
        };

        if (validateChoices(choices, metadata.decisions)) {
            results = tallyVote(choices, params.electionAddress, "ALL", results, metadata);
        } else {
            throw new Error("Invalid vote structure for ballot: " + ballotAddress);
        }
    }
    return results;
};

const tallyBasicElection = async (params) => {
    let Vote = await voteProto();
    let election = await BasicElection.at(params.electionAddress);
    let key = await election.privateKey();
    let voteCount = await election.getVoteCount();
    let metadata = await getIpfsBallot(election);

    //comply with tiered results structure
    let results = {
        election: params.electionAddress,
        ballots: {}
    };
    results.ballots[params.electionAddress] = {
        totalVotes: 0,
        decisionMetadata: metadata.decisions,
        ballotTitle: metadata.title,
        results: { "ALL": [] }
    };
    log("vote count = " + voteCount);
    for (let i = 0; i < voteCount; i++) {
        try {
            let encrypted = await election.getVoteAt(i);
            let encoded = decrypt(encrypted, key);
            log("length=" + encoded.length);
            log("encoded=" + encoded);
            let buff = Buffer.from(encoded, 'utf8');
            let vote = Vote.decode(buff);
            if(params.validateSignatures){
                let proof = await election.getProofAt(i);
                await validateSignature(Vote, vote, proof)
            }
            validateBallotCount(vote, 1)
            let choices = vote.ballotVotes[0].choices;

            validateChoices(choices, metadata.decisions)
            results = tallyVote(choices, params.electionAddress, "ALL", results, metadata);
            params.resultsUpdateCallback({
                status: "tallying",
                progress: {
                    poolIndex: 0,
                    poolTotal: 1,
                    poolBallotIndex: 0,
                    poolBallotTotal: 1,
                    poolVoterIndex: i,
                    poolVoterTotal: parseInt(voteCount)
                },
                results: results
            });
        } catch (e) {
            console.error(e);
            params.badVoteCallback({
                "pool": params.electionAddress,
                "reason": e.message,
                "index": i
            })
        }
    }
    return results;
};

let getFromIPFS = (location) => {
    return new Promise((resolve, reject) => {
        ipfs.catJSON(location, (err, obj) => {
            if (err) {
                console.error(err);
                reject(err);
            }
            resolve(obj)
        });
    })
}

const toEncodedVote = async (VoteProto, payload) => {
    let errMsg = VoteProto.verify(payload);
    if (errMsg) {
        console.error("invalid:"+errMsg);
        throw Error(errMsg);
    }

    let vote = await VoteProto.create(payload);
    return await VoteProto.encode(vote).finish();
};

const trimVote = async (VoteProto, voteObj) => {
    let trimmedPayload = {
        signatureSeed: voteObj.signatureSeed,
        ballotVotes: voteObj.ballotVotes
    };
    let ev = await toEncodedVote(VoteProto, trimmedPayload)
    return ev.toString("base64")
}

// INTERNAL METHODS
const validateSignature = async (VoteProto, voteObj, proof) => {
    if(!proof){
        throw new Error("proof is required and is absent")
    }
    let proofObj;
    try{
        proofObj = await getFromIPFS(proof);
    }catch(e){
        throw new Error("Could not find IPFS reference: "+proof+", error="+e.message);
    }
    if(!proofObj.signature){
        throw new Error("signature is not specified in IPFS proof: "+proof)
    }
    if(!proofObj.publicKey){
        throw new Error("publicKey is not specified in IPFS proof: "+proof)
    }

    let trimmedVote64 = await trimVote(VoteProto, voteObj);
    const pub = ursa.createPublicKey(proofObj.publicKey, 'base64');    
    if(!pub.hashAndVerify('md5', new Buffer(trimmedVote64), proofObj.signature, "base64")){
        throw new Error("signature is incorrect")
    }
    return true;
}

const validateBallotCount = (vote, count) => {
    if(vote.ballotVotes.length !== count){
        throw new Error("INVALID required ballot count="+count+", actual="+vote.ballotVotes.length);
    }
};

// spend totalPoints amongst the choices, all points must be spent
const validatePointsChoice = (choice, metadata) => {
    const c = choice;
    const selections = c.pointsAllocations;
    if (!selections || !selections.points ){
        throw new Error("INVALID selections be specified for points type");
    }
    if (selections.points.length !== (metadata.ballotItems.length)) {
        throw new Error("INVALID points must be allocated for each selection (or have 0 specified)");
    }
    let sum = 0;
    selections.points.forEach((points) => {
        sum += points;
    })
    if (sum !== metadata.totalPoints){
        throw new Error("INVALID not all points allocated, requires total of "+metadata.totalPoints);
    }
}

// strict numbering of 1-N for N choices
const validateRankedChoice = (choice, metadata) => {
    const c = choice;
    const selections = c.pointsAllocations;
    if (!selections || !selections.points ) {
        throw new Error("INVALID selections be specified for ranked type");
    }
    if (selections.points.length !== (metadata.ballotItems.length)) {
        throw new Error("INVALID points must be allocated for each selection (or have 0 specified)");
    }
    //must contain all of 1,2,3,...N
    for(let i=1; i<=selections.points.length; i++){
        if(selections.points.indexOf(i) === -1){
            throw new Error("INVALID ranked points must include every number from 1 to number of entries")
        }
    }
}

// each entry represents an index of a choice selected, numberToSelect must be selected
const validateMultipleChoice = (choice, metadata) => {
    const c = choice;
    const selections = c.indexSelections;
    if (!selections || !selections.indexes ) {
        throw new Error("INVALID indexSelections be specified for multiple choice type");
    }
    // cannot select more than allowed (default max is number of choices)
    let maxSelect = metadata.maxSelect || metadata.ballotItems.length; 
    if (selections.indexes.length > maxSelect) {
        throw new Error("INVALID must select fewer than "+maxSelect+" entries, found="+selections.indexes.length);
    }
    // cannot select fewer than allowed (default minum is 1.  0 requires explicit Abstain)
    let minSelect = metadata.minSelect || 1;
    if (selections.indexes.length < minSelect) {
        throw new Error("INVALID must select more than "+minSelect+" entries, found="+selections.indexes.length);
    }
    for(let i=1; i<=selections.indexes.length; i++){
        if (selections.indexes[i] < 0) {
            throw new Error("INVALID selection < 0: " + selections.indexes[i]);
        }
        if (selections.indexes[i] > (metadata.ballotItems.length - 1)) {
            throw new Error("INVALID selection > array: " + selections.indexes[i]);
        }
    }
}

const validateSingleChoice = (choice, metadata) => {
    const c = choice;
    if(!c.writeIn){
        if(c.selection === undefined || c.selection === null){
            throw new Error("INVALID selection must be set")
        }
        if (c.selection < 0) {
            throw new Error("INVALID selection < 0: " + c.selection);
        }
        if (c.selection > (metadata.ballotItems.length - 1)) {
            throw new Error("INVALID selection > array: " + c.selection);
        }
    }
}

const validations = {
    "points": validatePointsChoice,
    "ranked": validateRankedChoice,
    "multiple": validateMultipleChoice,
    "single": validateSingleChoice
}

const validateChoices = (choices, decisionsMetadata) => {
    if (choices.length !== decisionsMetadata.length) {
        throw new Error(`INVALID not enough choices (${choices.length}) for number of decisions (${decisionsMetadata.length})`);
    }

    choices.forEach((c, idx) => {
        let choiceType = decisionsMetadata[idx].type || "single"
        if(!c.abstain) {
            validations[choiceType](c, decisionsMetadata[idx])
        }
    });

    return true;
};

const log = (msg) => {
    //console.log(msg);
};

const initDecisionResults = (decisionMeta) => {
    let decisionResults = {};
    decisionMeta.ballotItems.forEach((d) => {
        decisionResults[d.itemTitle] = 0;
    });
    return decisionResults;
};

const tallySingleChoice = (choice, ballotItemsMetadata, decision) => {
    if (choice.writeIn) {
        let writeInVal = choice.writeIn.toUpperCase().trim();
        if (!decision["WRITEIN-" + writeInVal]) {
            decision["WRITEIN-" + writeInVal] = 0;
        }
        decision["WRITEIN-" + writeInVal]++;
    } else {
        let selectionIndex = parseInt(choice.selection);
        let selectionTitle = ballotItemsMetadata[selectionIndex]["itemTitle"];
        decision[selectionTitle]++;
    }
}

const tallyMultipleChoice = (choice, ballotItemsMetadata, decision) => {
    choice.indexSelections.indexes.forEach((selectionIndex, idx) => {
        let selectionTitle = ballotItemsMetadata[selectionIndex]["itemTitle"];
        decision[selectionTitle]++;
    })
}

const tallyPointsChoice = (choice, ballotItemsMetadata, decision) => {
    choice.pointsAllocations.points.forEach((points, idx) => {
        let selectionTitle = ballotItemsMetadata[idx]["itemTitle"];
        decision[selectionTitle]+=points;
    })
}

const tallyVote = (choices, ballot, group, result, metadata) => {
    choices.forEach((choice, idx) => {
        let decisionMeta = metadata.decisions[idx];
        let decisionKey = idx;

        // inititalize
        if (!result.ballots[ballot].results[group][decisionKey]) {
            result.ballots[ballot].results[group][decisionKey] = initDecisionResults(decisionMeta);
        }

        let decision = result.ballots[ballot].results[group][decisionKey];
        let choiceType = decisionMeta.type || "single";

        if(choice.abstain) {
            if (!decision["ABSTAIN"]) {
                decision["ABSTAIN"] = 0;
            }
            decision["ABSTAIN"]++;
        } else if(choiceType === "single"){
            tallySingleChoice(choice, decisionMeta["ballotItems"], decision);
        } else if(choiceType === "points" || choiceType === "ranked") {
            tallyPointsChoice(choice, decisionMeta["ballotItems"], decision);
        } else if(choiceType === "multiple") {
            tallyMultipleChoice(choice, decisionMeta["ballotItems"], decision);
        }
        result.ballots[ballot].results[group][idx] = decision;
    });
    result.ballots[ballot].totalVotes++;
    return result;
};

const initTally = async (params) => {
    if (!params.provider) {
        throw new Error("param.provider is required")
    }
    if (!params.electionAddress) {
        throw new Error("param.electionAddress is required")
    }
    if (!params.resultsUpdateCallback) {
        params.resultsUpdateCallback = (obj) => {
            log(JSON.stringify(obj));
        }
    }
    if (!params.badVoteCallback) {
        params.badVoteCallback = (obj) => {
            log(JSON.stringify(obj));
        }
    }
    if (!params.version) {
        throw new Error("expected version parameter (e.g., 18)")
    }

    nv.Init(params.provider, params.version)
    BasicElection = await nv.BasicElection(params.version);
    TieredPool = await nv.TieredPool(params.version);
    TieredBallot = await nv.TieredBallot(params.version);
    TieredElection = await nv.TieredElection(params.version);
    BasePool = await nv.BasePool(params.version);
    BaseBallot = await nv.BaseBallot(params.version);
    BaseElection = await nv.BaseElection(params.version);
    web3 = nv.web3();
};


const voteProto = async () => {
    let root = await protobuf.load(protoPath);
    return root.lookupType("netvote.Vote");
};

const getIpfsBallot = (ballot) => {
    return new Promise(async (resolve, reject) => {
        let location = await ballot.metadataLocation();
        ipfs.catJSON(location, (err, metadata) => {
            log(JSON.stringify(metadata));
            if (err) {
                console.error(err);
                reject(err);
            }
            let decisions = [];
            metadata.ballotGroups.forEach((bg) => {
                decisions.pushArray(bg.ballotSections);
            });
            resolve({
                title: metadata.ballotTitle,
                decisions: decisions
            });
        });
    });
};

const getGroupsForPool = async (ballot, poolAddr) => {
    let pgCount = await ballot.getPoolGroupCount(poolAddr);
    let groups = [];
    for (let i = 0; i < pgCount; i++) {
        let g = await ballot.getPoolGroupAt(poolAddr, i);
        groups.push(web3.toAscii(g).replace(/[\u0000]/g, '').trim());
    }
    return groups;
};

function decrypt(v, password) {
    let decipher = crypto.createDecipher("aes-256-cbc", new Buffer(password));
    let dec = decipher.update(v, "base64", "utf8");
    dec += decipher.final("utf8");
    return dec;
}

let mockSignatureObj;

const mockIpfsSignatures = (obj) =>{
    mockSignatureObj = obj;
    getFromIPFS = (location) => {
        return mockSignatureObj[location];
    }
}

module.exports = {
    tallyElection,
    tallyTxVote,
    validateChoices,
    mockIpfsSignatures
};
