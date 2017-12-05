'use strict';

const ballotAbi = require('./abi/Ballot.json').abi;
const electionAbi = require('./abi/Election.json').abi;
const poolAbi = require('./abi/RegistrationPool.json').abi;
const protobuf = require("protobufjs");
const crypto2 = require('crypto2');

const Eth = require('ethjs');
let tallyProvider = "http://localhost:9545/";

let eth;

let log = (msg) => {
    console.log(msg);
};

let voteCallback = (vote)=>{
    log("vote="+JSON.stringify(vote));
};


/**
 * Wrapper function that tallies results for a ballot
 * @param {object} params - object containing all required parameters
 * @param {string} params.electionAddress - the address of the ballot to tally
 * @param {string} params.provider - the url of the provider of the remote node (default: localhost:9545)
 * @param {string} params.voteCallback - each vote will invoke this callback w/results (for ui)
 * @param {string} params.groupCallback - each group tally will invoke this callback w/results (for ui)
 * @returns {Promise}
 */
const tally = async (params) => {
    log("TALLY START");
    if (params.provider) {
        tallyProvider = params.provider;
    }
    if (params.voteCallback) {
        voteCallback = params.voteCallback;
    }

    eth = new Eth(new Eth.HttpProvider(tallyProvider));
    let electionAddr = params.electionAddress;

    let root = await protobuf.load("protocol/vote.proto");
    let Vote = root.lookupType("netvote.Vote");
    let privateKey = await getElectionPrivateKey(electionAddr);

    let ballotLength = await getElectionBallotCount(electionAddr);

    let result = {};

    for(let b=0; b<ballotLength; b++){
        let ballotAddr = await getElectionBallotAt(electionAddr, b);

        result[ballotAddr] = {};

        let ballotInfo = await collectBallotInfo(ballotAddr);

        for(let group of ballotInfo.groups){
            result[ballotAddr][group] = [];

            let pools = ballotInfo.groupPools[group].pools;
            for (let pool of pools) {
                for(let voterIndex=0; voterIndex<pool.voterCount; voterIndex++){
                    let encryptedVote = await getPoolVote(ballotAddr, pool.address, voterIndex);
                    let encodedVote = await decrypt(encryptedVote, privateKey);
                    let buff = Buffer.from(encodedVote, 'utf8');
                    let vote = Vote.decode(buff);
                    let choices = vote.ballotVotes[pool.index].choices;

                    result = addVoteToResult(choices, ballotAddr, group, result);

                    voteCallback(result);
                }
            }
        }
    }
    return result;
};

const addVoteToResult = (choices, ballotAddr, group, result) => {

    for(let c=0; c<choices.length; c++){
        if(!result[ballotAddr][group][c]){
            result[ballotAddr][group][c] = {};
        }

        let choice = choices[c];

        if(choice.writeIn) {
            let cleanWriteIn = choice.writeIn.toLowerCase().trim();
            if(!result[ballotAddr][group][c]["writeIn"]){
                result[ballotAddr][group][c]["writeIn"] = {};
            }
            if(!result[ballotAddr][group][c]["writeIn"][cleanWriteIn]){
                result[ballotAddr][group][c]["writeIn"][cleanWriteIn] = 0;
            }
            result[ballotAddr][group][c]["writeIn"][cleanWriteIn]++;
        }else{
            if(!result[ballotAddr][group][c][""+choice.selection]){
                result[ballotAddr][group][c][""+choice.selection] = 0;
            }
            result[ballotAddr][group][c][""+choice.selection]++;
        }
    }
    return result;
};

const decrypt = async (vote, privateKey) => {
    return new Promise((resolve, reject) => {
        crypto2.decrypt.rsa(vote, privateKey, (err, decrypted) => {
            if (err) {
                console.error("error decrypting: " + err);
                reject(err);
                return;
            }
            resolve(decrypted);
        });
    });
};

const collectBallotInfo = async (ballotAddr) => {
    let res = {
        election: null,
        groups: null,
        groupPools: {}
    };

    res.groups = (await getGroups(ballotAddr));

    for (let group of res.groups) {
        res.groupPools[group] = {
            pools: []
        };

        let poolCount = await getGroupPoolCount(ballotAddr, group);

        for(let i=0; i<poolCount; i++){
            let poolAddress = await getGroupPool(ballotAddr, group, i);
            let voterCount = await getPoolVoterCount(ballotAddr, poolAddress);
            let ballotIndex = await getPoolBallotIndex(poolAddress, ballotAddr);
            res.groupPools[group].pools.push({
               address: poolAddress,
               voterCount: voterCount,
               index: ballotIndex
            });
        }
    }
    return res;
};

const electionAt = (addr) =>{
    return contract(electionAbi, addr);
};

const ballotAt = (addr) =>{
    return contract(ballotAbi, addr);
};

const poolAt = (addr) =>{
    return contract(poolAbi, addr);
};

const contract = (abi, addr) =>{
    return eth.contract(abi).at(addr);
};

const getElectionPrivateKey = async (electionAddr) => {
    return (await electionAt(electionAddr).privateKey())[0];
};

const getElectionPoolCount = async (electionAddr) => {
    return (await electionAt(electionAddr).getPoolCount())[0];
};

const getElectionPoolAt = async (electionAddr, index) => {
    return (await electionAt(electionAddr).getPool(index))[0];
};

const getElectionBallotCount = async (electionAddr) => {
    return (await electionAt(electionAddr).getBallotCount())[0];
};

const getElectionBallotAt = async (electionAddr, index) => {
    return (await electionAt(electionAddr).getBallot(index))[0];
};

const getGroups = async (ballotAddr) => {
    let res = [];
    let c = (await ballotAt(ballotAddr).getGroupCount())[0];
    for(let i=0; i<c; i++){
        let g = (await ballotAt(ballotAddr).getGroup(i))[0];
        g = toString(g);
        res.push(g);
    }
    log("groups: "+JSON.stringify(res));
    return res;
};

const toString = (hex) => {
   return Eth.toAscii(hex).replace(/[\u0000-\u0010]/g, '').trim();
};

const getGroupPoolCount = async (ballotAddr, group) => {
    return (await ballotAt(ballotAddr).groupPoolCount(Eth.fromAscii(group)))[0];
};

const getGroupPool = async (ballotAddr, group, index) => {
    return (await ballotAt(ballotAddr).getGroupPool(Eth.fromAscii(group), index))[0];
};

const getPoolBallotIndex = async (poolAddr, ballotAddr) => {
    return (await poolAt(poolAddr).getBallotIndex(ballotAddr))[0];
};

const getPoolVoterCount = async (ballotAddr, poolAddr) => {
    return (await ballotAt(ballotAddr).getPoolVoterCount(poolAddr))[0];
};

const getPoolVote = async (ballotAddr, poolAddr, index) => {
    let vtr = await getPoolVoter(ballotAddr, poolAddr, index);
    return await getEncryptedVote(poolAddr, vtr);
};

const getPoolVoter = async (ballotAddr, poolAddr, index) => {
    return (await ballotAt(ballotAddr).getPoolVoter(poolAddr, index))[0];
};

const getEncryptedVote = async (poolAddr, voterAddr) => {
    return (await poolAt(poolAddr).getVote(voterAddr))[0];
};

module.exports = {
    tally
};