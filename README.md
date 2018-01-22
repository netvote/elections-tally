Netvote Tally Library
======================

<img src="https://s3.amazonaws.com/netvote-docs/nv.png" alt="Logo"  height="25%" width="25%"/>

Library and CLI for tallying elections

Example Usage:
```javascript
const tally = require('@netvote/elections-tally');

tally.tallyElection({
    electionAddress: '0x70329ebf41456077e2074d66d68e2aeb1286be4b',
    provider: 'https://ropsten.infura.io',
    resultsUpdateCallback: (resultsStatusObj) => {
        
        // Update UI progress indicators (graphs/etc)
        
    }
}).then((finalResults) => {
    
    // Tallying complete
    
}).catch((err) => {
    console.error(err);
});

```

Example Results Status Object
```javascript
// pool 0 of 15
// voter 3 of 48748 in pool
// ballot 2 of 3
resultsStatusObj = {
    "status": "tallying",
    "progress": {
        "poolIndex": 0,           //current pool index
        "poolTotal": 15,          //total pools
        "poolBallotIndex": 2,     //current ballot for this pool
        "poolBallotTotal": 3,     //total ballots for pool
        "poolVoterIndex": 3,      //index of voter for this pool
        "poolVoterTotal": 48748   //total voters for this pool
    },
    "results": {
      // current results object
    }
}
```

Example Results
```javascript
finalResults = {
    "electionAddress": "0x70329ebf41456077e2074d66d68e2aeb1286be4b",
    "ballots": {
        "0xABCD9ebf41456077e2074d66d68e2aeb1286be4b": {
            "totalVotes": 10,
            "results":{
                // RESULTS BY GROUP
                "ALL": [
                    // FIRST DECISION
                    {
                        "0": 2,
                        "1": 4,
                        "writeIn":{
                            "JOHN DOE": 4
                        }
                    },
                    // SECOND DECISION
                    {
                        "0": 1,
                        "1": 7,
                        "2": 1,
                        "writeIn":{
                            "JANE SMITH": 1
                        }
                    }
                ],
                "district-1": [
                    // FIRST DECISION
                    {
                        "0": 2,
                        "1": 2,
                        "writeIn":{
                            "JOHN DOE": 2
                        }
                    },
                    // SECOND DECISION
                    {
                        "0": 1,
                        "1": 4
                    }
                ],
                "district-2": [
                    // FIRST DECISION
                    {
                        "1": 2,
                        "writeIn":{
                            "JOHN DOE": 2
                        }
                    },
                    // SECOND DECISION
                    {
                        "1": 3,
                        "2": 1,
                        "writeIn":{
                            "JANE SMITH": 1
                        }
                    }
                ]
            }
        }
    }
}
```

License
-------
All code is released under GPL v3.
