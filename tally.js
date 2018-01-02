const contract = require("truffle-contract");
const Web3 = require("web3");
const protobuf = require("protobufjs");
const crypto = require('crypto');

let web3;

let BasicElection = contract(require('./abi/BasicElection.json'));
let TieredElection = contract(require('./abi/TieredElection.json'));
let TieredBallot = contract(require('./abi/TieredBallot.json'));
let TieredPool = contract(require('./abi/TieredPool.json'));

/**
 * Wrapper function that tallies results for a ballot
 * @param {object} params - object containing all required parameters
 * @param {string} params.electionAddress - the address of the ballot to tally
 * @param {string} params.provider - the url of the provider of the remote node (default: localhost:9545)
 * @param {string} params.resultsUpdateCallback - each vote will invoke this callback w/results (for ui)
 * @returns {Promise}
 */
const tallyElection = async (params) => {
    initTally(params);
    let election = TieredElection.at(params.electionAddress);
    let electionType = await election.electionType();
    switch(electionType){
        case "TIERED":
            return tallyTieredElection(params);
        case "BASIC":
            return tallyBasicElection(params);
        default:
            throw Error("invalid election type: "+electionType);
    }
};

const tallyTieredElection = async (params) => {
    initTally(params);
    let Vote = await voteProto();
    let election = TieredElection.at(params.electionAddress);
    let key = await election.privateKey();

    let results = {
        election: params.electionAddress,
        ballots: {}
    };

    let poolCount = await election.getPoolCount();
    for(let p = 0; p < poolCount; p++){
        let poolAddress = await election.getPool(p);
        let pool = TieredPool.at(poolAddress);
        let ballotCount = await pool.getBallotCount();
        for(let b = 0; b<ballotCount; b++){
            let ballotAddress = await pool.getBallot(b);

            if (!results.ballots[ballotAddress]) {
                results.ballots[ballotAddress] = {
                    totalVotes: 0,
                    results: {}
                };
            }

            let ballot = TieredBallot.at(ballotAddress);
            let poolGroups = await getGroupsForPool(ballot, poolAddress);
            let voteCount = await pool.getVoteCount();

            for(let i=0; i<voteCount; i++){
                let encrypted = await pool.getVoteAt(i);
                let encoded = decrypt(encrypted, key);
                let buff = Buffer.from(encoded, 'utf8');
                let vote = Vote.decode(buff);
                let choices = vote.ballotVotes[0].choices;
                poolGroups.forEach((group, pgi) => {
                    if(!results.ballots[ballotAddress].results[group]){
                        results.ballots[ballotAddress].results[group] = []
                    }
                    results = tallyVote(choices, ballotAddress, group, results);
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
            }
        }
    }

    return results;
};

const tallyBasicElection = async (params) => {
    initTally(params);
    let Vote = await voteProto();
    let election = BasicElection.at(params.electionAddress);
    let key = await election.privateKey();
    let voteCount = await election.getVoteCount();

    //comply with tiered results structure
    let results = {
        election: params.electionAddress,
        ballots: {}
    };
    results.ballots[params.electionAddress] = {
        totalVotes: 0,
        results:{"ALL":[]}
    };

    for(let i=0; i<voteCount; i++){
        let encrypted = await election.getVoteAt(i);
        let encoded = decrypt(encrypted, key);
        let buff = Buffer.from(encoded, 'utf8');
        let vote = Vote.decode(buff);
        let choices = vote.ballotVotes[0].choices;
        results = tallyVote(choices, params.electionAddress, "ALL", results);
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
    }
    return results;
};

// INTERNAL METHODS

const log = (msg) => {
    console.log(msg);
};

const tallyVote = (choices, ballot, group, result) => {
    choices.forEach((choice, idx) => {
        if(!result.ballots[ballot].results[group][idx]){
            result.ballots[ballot].results[group][idx] = {};
        }
        let decision = result.ballots[ballot].results[group][idx];
        if(choice.writeIn){
            if(!decision["writeIn"]){
                decision["writeIn"] = {};
            }
            let writeInVal = choice.writeIn.toUpperCase().trim();
            if(!decision["writeIn"][writeInVal]){
                decision["writeIn"][writeInVal] = 0;
            }
            decision["writeIn"][writeInVal]++;
        }else{
            if(!decision[choice.selection]){
                decision[choice.selection] = 0;
            }
            decision[choice.selection]++;
        }
        result.ballots[ballot].results[group][idx] = decision;
    });
    result.ballots[ballot].totalVotes++;
    return result;
};

const initTally = (params) => {
    if (!params.provider) {
        throw new Error("param.provider is required")
    }
    if (!params.electionAddress) {
        throw new Error("param.electionAddress is required")
    }
    if (!params.resultsUpdateCallback){
        params.resultsUpdateCallback = (obj) => {
            console.log(JSON.stringify(obj));
        }
    }
    let provider = new Web3.providers.HttpProvider(params.provider);
    BasicElection.setProvider(provider);
    TieredPool.setProvider(provider);
    TieredBallot.setProvider(provider);
    TieredElection.setProvider(provider);
    web3 = new Web3(provider);
};


const voteProto = async () => {
    let root = await protobuf.load("protocol/vote.proto");
    return root.lookupType("netvote.Vote");
};

const getGroupsForPool = async(ballot, poolAddr) => {
    let pgCount = await ballot.getPoolGroupCount(poolAddr);
    let groups = [];
    for(let i=0; i<pgCount; i++){
        let g = await ballot.getPoolGroupAt(poolAddr, i);
        groups.push(web3.toAscii(g).replace(/[\u0000]/g, '').trim());
    }
    return groups;
};

function decrypt(v, password){
    let decipher = crypto.createDecipher("aes-256-cbc", new Buffer(password));
    let dec = decipher.update(v, "base64","utf8");
    dec += decipher.final("utf8");
    return dec;
}

module.exports = {
    tallyElection
};