#!/usr/bin/env node

let program = require('commander');
let tally = require('../tally');

program
    .version('0.0.1')
    .arguments('<ballotAddress>')
    .parse(process.argv);


let addr = program.args[0];

tally.tally({
    electionAddress: addr
}).then((res) => {
    console.log(JSON.stringify(res,null,"\t"));
}).catch((err) => {
    console.error(err);
});