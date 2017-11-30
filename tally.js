'use strict';

const ethereumRemote = require('ethereumjs-remote');
const ballotAbi = require('./abi/Ballot.json').abi;
const electionAbi = require('./abi/Election.json').abi;
const poolAbi = require('./abi/RegistrationPool.json').abi;

let Web3Utils = require('web3-utils');

let tallyProvider = "http://localhost:9545/";

let log = (msg) => {
    console.log(msg);
};

let voteCallback = (vote)=>{
    log("vote="+JSON.stringify(vote));
};

/**
 * Wrapper function that tallies results for a ballot
 * @param {object} params - object containing all required parameters
 * @param {string} params.ballotAddress - the address of the ballot to tally
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

    let ballotAddr = params.ballotAddress;

    let results = {};

    let metadata = await initTallyMetadata(ballotAddr);
    log("METADATA: "+JSON.stringify(metadata, null, '\t'));

    for(let group of metadata.groups){
       let pools = metadata.groupPools[group].pools;
       log("GROUP:"+group);
       for (let pool of pools) {
           for(let voterIndex=0; voterIndex<pool.voterCount; voterIndex++){
               let encryptedVote = await getPoolVote(ballotAddr, pool.address, voterIndex);
               let vote = decrypt(encryptedVote, metadata.privateKey);
               voteCallback(vote);
           }
       }
    }
    return results;
};

//TODO: implement decryption, extract selections
const decrypt = (vote, ballotAddress, privateKey) => {
    //TODO: hardcoded selections
    return vote;
};

const initTallyMetadata = async (ballotAddr) => {
    let res = {
        ballot: ballotAddr,
        election: null,
        groups: null,
        groupPools: {},
        privateKey: null
    };
    res.election = await getElectionAddress(ballotAddr);
    res.privateKey = await getElectionPrivateKey(res.election);
    res.groups = await getGroups(ballotAddr);

    for (let group of res.groups) {
        res.groupPools[group] = {
            pools: []
        };

        let poolCount = await getGroupPoolCount(ballotAddr, group);

        for(let i=0; i<poolCount; i++){
            let poolAddress = await getGroupPool(ballotAddr, group, i);
            let voterCount = await getPoolVoterCount(ballotAddr, poolAddress);
            res.groupPools[group].pools.push({
               address: poolAddress,
               voterCount: voterCount
            });
        }
    }
    return res;
};

const getElectionPrivateKey = async (electionAddr) => {
    let pk = await remoteElectionCall(electionAddr, "privateKey", []);
    return toString(pk);
};

const getElectionAddress = async (ballotAddr) => {
    let el = await remoteBallotCall(ballotAddr, "election", []);
    return toAddress(el);
};

const getGroups = async (ballotAddr) => {
    let res = [];
    let c = await remoteBallotCall(ballotAddr, "getGroupCount", []);
    for(let i=0; i<c; i++){
        let g = await remoteBallotCall(ballotAddr, "getGroup", [i]);
        g = toString(g);
        res.push(g);
    }
    log("groups: "+JSON.stringify(res));
    return res;
};

const toString = (hex) => {
   return Web3Utils.toAscii(hex).replace(/[\u0000-\u0010]/g, '').trim();
};

const toAddress = (padded) => {
    return padded.replace("0x000000000000000000000000","0x");
};

const toNumber = (num) =>{
    return Web3Utils.hexToNumber(num);
};

const getGroupPoolCount = async (ballotAddr, group) => {
    let c = await remoteBallotCall(ballotAddr, "groupPoolCount", [group]);
    return toNumber(c);
};

const getGroupPool = async (ballotAddr, group, index) => {
    let pool = await remoteBallotCall(ballotAddr, "getGroupPool", [group, index]);
    return toAddress(pool);
};

const getPoolVoterCount = async (ballotAddr, poolAddr) => {
    let c = await remoteBallotCall(ballotAddr, "getPoolVoterCount", [poolAddr]);
    return toNumber(c);
};

const getPoolVote = async (ballotAddr, poolAddr, index) => {
    let vtr = await getPoolVoter(ballotAddr, poolAddr, index);
    let vote = await getEncryptedVote(poolAddr, vtr);
    return toString(vote);
};

const getPoolVoter = async (ballotAddr, poolAddr, index) => {
    let pv = await remoteBallotCall(ballotAddr, "getPoolVoter", [poolAddr, index]);
    return toAddress(pv);
};

const getEncryptedVote = (poolAddr, voterAddr) => {
    return remotePoolCall(poolAddr, "getVote", [voterAddr]);
};

const remoteElectionCall = (addr, func, params) => {
    return remoteCall(addr, electionAbi, func, params);
};

const remoteBallotCall = (addr, func, params) => {
    return remoteCall(addr, ballotAbi, func, params);
};

const remotePoolCall = (addr, func, params) => {
    return remoteCall(addr, poolAbi, func, params);
};

const remoteCall = (addr, abi, func, params) => {
    return ethereumRemote.call({
        contractAddress: addr,
        abi: abi,
        functionName: func,
        functionArguments: params,
        provider: tallyProvider
    })
};

module.exports = {
    tally
};