#!/usr/bin/env node

let program = require('commander');
let tally = require('../tally');
const Eth = require('ethjs');

const MAINNET_URL = "https://mainnet.infura.io/g6NZb5DRhMKT6HS5D2D2";
const ROPSTEN_URL = "https://ropsten.infura.io/g6NZb5DRhMKT6HS5D2D2";

let election;

program
    .version('0.0.1')
    .usage('[options] <electionAddress>')
    .arguments('<electionAddress>').action(function (electionAddress) {
        election = electionAddress;
    })
    .option("-r, --ropsten", "Use ropsten test network")
    .option("-p, --provider [provider]", "Use specified endpoint")
    .parse(process.argv);

if(!election || !Eth.isAddress(election)) {
    console.log("First argument must contain valid address of election (e.g., 0xabc...)");
    program.help();
    process.exit(1);
}

let provider = MAINNET_URL;
if(program.provider){
    provider = program.provider;
} else if (program.ropsten){
    provider = ROPSTEN_URL;
}

console.log("provider = "+program.provider);

tally.tallyAllByPool({
    electionAddress: election,
    provider: provider,
    resultsUpdateCallback: (res) => {
        console.log("results update: "+JSON.stringify(res));
    }
}).then((res) => {
    console.log("final results: "+JSON.stringify(res));
}).catch((err) => {
    console.error(err);
});