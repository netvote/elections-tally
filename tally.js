'use strict';

const ethereumRemote = require('ethereumjs-remote');
const ballotAbi = require('./abi/Ballot.json').abi;
const electionAbi = require('./abi/Election.json').abi;
const poolAbi = require('./abi/RegistrationPool.json').abi;
const protobuf = require("protobufjs");
const crypto2 = require('crypto2');


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

    let electionAddr = params.electionAddress;

    console.log("electionAddr = "+electionAddr);

    let root = await protobuf.load("protocol/vote.proto");
    let Vote = root.lookupType("netvote.Vote");

    let privateKey = await getElectionPrivateKey(electionAddr);

    let ballotLength = await getElectionBallotCount(electionAddr);

    for(let b=0; b<ballotLength; b++){
        let ballotAddr = await getElectionBallotAt(electionAddr, b);
        let ballotInfo = await collectBallotInfo(ballotAddr);

        for(let group of ballotInfo.groups){
            let pools = ballotInfo.groupPools[group].pools;
            for (let pool of pools) {
                for(let voterIndex=0; voterIndex<pool.voterCount; voterIndex++){
                    let encryptedVote = await getPoolVote(ballotAddr, pool.address, voterIndex);
                    let encodedVote = await decrypt(encryptedVote, privateKey);
                    let buff = Buffer.from(encodedVote, 'utf8');
                    let vote = Vote.decode(buff);
                    voteCallback(vote);
                }
            }
        }
    }
    return {};
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
    let pkStr = Web3Utils.toAscii(pk);
    return pkStr.substring(pkStr.indexOf("-"), pkStr.lastIndexOf("-")+1);
};

const getElectionPoolCount = async (electionAddr) => {
    let pc = await remoteElectionCall(electionAddr, "getPoolCount", []);
    return toNumber(pc);
};

const getElectionPoolAt = async (electionAddr, index) => {
    let p = await remoteElectionCall(electionAddr, "getPool", [index]);
    return toAddress(p);
};

const getElectionBallotCount = async (electionAddr) => {
    let pc = await remoteElectionCall(electionAddr, "getBallotCount", []);
    return toNumber(pc);
};

const getElectionBallotAt = async (electionAddr, index) => {
    let p = await remoteElectionCall(electionAddr, "getBallot", [index]);
    return toAddress(p);
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
    let vt = Web3Utils.hexToAscii(vote);
    return vt.substring(vt.indexOf("X")+1)
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