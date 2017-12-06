#!/usr/bin/env node

let program = require('commander');
let tally = require('../tally');

program
    .version('0.0.1')
    .arguments('<ballotAddress>')
    .parse(process.argv);


let addr = program.args[0];

tally.tallyAllByPool({
    electionAddress: addr
}).then((res) => {
    console.log("BY POOL="+JSON.stringify(res,null,"\t"));
}).catch((err) => {
    console.error(err);
});

tally.tallyAllByBallot({
    electionAddress: addr
}).then((res) => {
    console.log("BY Ballot="+JSON.stringify(res,null,"\t"));
}).catch((err) => {
    console.error(err);
});