Netvote Tally Library
======================

<img src="https://s3.amazonaws.com/netvote-docs/nv.png" alt="Logo"  height="25%" width="25%"/>

Library and CLI for tallying elections

Example Usage:
```
const tally = require('@netvote/elections-tally');

tally.tallyElection({
    electionAddress: '0x70329ebf41456077e2074d66d68e2aeb1286be4b',
    provider: 'https://ropsten.infura.io',
    resultsUpdateCallback: (res) => {
        console.log("update the ui with a vote");
    }
}).then((res) => {
    console.log("final results: "+JSON.stringify(res, null, "\t"));
}).catch((err) => {
    console.error(err);
});

```

License
-------
All code is released under GPL v3.
