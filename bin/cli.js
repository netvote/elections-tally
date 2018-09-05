#!/usr/bin/env node

var fs = require('fs');
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
    .option("-e, --export [export]", "Validate signatures")
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

let voteCounter = 0;

if(program.export){
    if (!fs.existsSync(program.export)){
        fs.mkdirSync(program.export);
    }
}

const writeVote = async(path, vote)=>{
    return new Promise((resolve, reject)=>{
        fs.writeFile(path, JSON.stringify(vote), function(err) {
            if(err){
                reject(err);
            } else {
                resolve(true);
            }
        });
    })
}

let badVoteCounter = 0;

tally.tallyElection({
    electionAddress: election,
    version: 22,
    export: program.export,
    provider: program.provider,
    validateSignatures: validateSignatures,
    badVoteCallback: async(obj)=>{
        console.log("BAD VOTE:"+ JSON.stringify(obj))
        if(program.export){
            badVoteCounter++;
            await writeVote(program.export+"/BADVOTE"+badVoteCounter+".json", obj)
        }
    },
    resultsUpdateCallback: async (res) => {
        if(program.export){
            voteCounter++;
            await writeVote(program.export+"/vote"+voteCounter+".json", res.vote)
        }
    }
}).then((res) => {
    console.log(JSON.stringify(res, null, "\t"));
}).catch((err) => {
    console.error(err);
});