#!/usr/bin/env node

let program = require('commander');
let tally = require('../tally');

let election="";

//EXAMPLE
//node bin/cli.js --signatures --provider https://eth.netvote.io 0x451f1bab405add84bb2263cdfbdf218fbf611282

program
    .version('0.0.1')
    .usage('[options] <electionAddress>')
    .arguments('<electionAddress>').action(function (electionAddress) {
        election = electionAddress;
    })
    .option("-p, --provider [provider]", "Use specified endpoint")
    .option("-s, --signatures", "Validate signatures")
    .parse(process.argv);

if(!election) {
    console.log("First argument must contain valid address of election (e.g., 0xabc...)");
    program.help();
    process.exit(1);
}

if(!program.provider) {
    console.log("Provider (--provider, -p) is required.  Example: http://localhost:9545/");
    program.help();
    process.exit(1);
}

let validateSignatures = (program.signatures) ? true : false;

tally.tallyElection({
    electionAddress: election,
    version: 22,
    provider: program.provider,
    validateSignatures: validateSignatures,
    resultsUpdateCallback: (res) => {}
}).then((res) => {
    console.log(JSON.stringify(res, null, "\t"));
}).catch((err) => {
    console.error(err);
});