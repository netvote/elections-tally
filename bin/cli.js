#!/usr/bin/env node

let program = require('commander');
let tally = require('../tally');
const Eth = require('ethjs');

let election;

program
    .version('0.0.1')
    .usage('[options] <electionAddress>')
    .arguments('<electionAddress>').action(function (electionAddress) {
    election = electionAddress;
})
    .option("-p, --provider [provider]", "Use specified endpoint")
    .parse(process.argv);

if(!election) {
    console.log("First argument must contain valid address of election (e.g., 0xabc...)");
    program.help();
    process.exit(1);
}

console.log("provider = "+program.provider);

tally.tallyElection({
    electionAddress: election,
    provider: program.provider,
    resultsUpdateCallback: (res) => {
        console.log("results update: "+JSON.stringify(res));
    }
}).then((res) => {
    console.log("final results: "+JSON.stringify(res));
}).catch((err) => {
    console.error(err);
});