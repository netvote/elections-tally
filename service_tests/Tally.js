//NOTE: this is a truffle contract test that is feathered into elections-solidity (for end-to-end test)
//pre-test.sh must run first
//this will run within elections-solidity/test/tally/*

const tally = require("../../../tally.js");
const uuid = require("uuid/v4");

const assertResult = (actual, expected) => {
    let actualStr = JSON.stringify(actual);
    let expectedStr = JSON.stringify(expected);
    assert.equal(actualStr, expectedStr)
};

let TEST_METADATA = "QmNdYM85iDvXtyGGsPsE7n1kcy3A68YdsVV1eBAg33mraA"

contract('Decision Types Tally', function (accounts) {
    const election = require("../end-to-end/jslib/basic-election.js");

    let config;

    before(async ()=>{
        let vote1Json = {
            encryptionSeed: 12345,
            ballotVotes: [
                {
                    choices: [
                        {
                            indexSelections: {
                                indexes: [0, 1]
                            }
                        },
                        {
                            selection: 1
                        },
                        {
                            pointsAllocations: {
                                points: [1,2,3]
                            }
                        },
                        {
                            pointsAllocations: {
                                points: [3,6]
                            }
                        }
                    ]
                }
            ]
        };
        let vote2Json = {
            encryptionSeed: 54321,
            ballotVotes: [
                {
                    choices: [
                        {
                            indexSelections: {
                                indexes: [1, 2]
                            }
                        },
                        {
                            selection: 1
                        },
                        {
                            pointsAllocations: {
                                points: [2,1,3]
                            }
                        },
                        {
                            pointsAllocations: {
                                points: [1,8]
                            }
                        }
                    ]
                }
            ]
        };

        let abstainJson = {
            encryptionSeed: 54321,
            ballotVotes: [
                {
                    choices: [
                        {
                            abstain: true
                        },
                        {
                            abstain: true
                        },
                        {
                            abstain: true
                        },
                        {
                            abstain: true
                        }
                    ]
                }
            ]
        };

        let vote1 = await election.toEncryptedVote(vote1Json);
        let vote2 = await election.toEncryptedVote(vote2Json);
        let abstainVote = await election.toEncryptedVote(abstainJson);

        config = await election.doEndToEndElectionAutoActivate({
            account: {
                allowance: 3,
                owner: accounts[0]
            },
            netvote: accounts[1],
            admin: accounts[2],
            allowUpdates: false,
            autoActivate: true,
            skipGasMeasurment:  true,
            gateway: accounts[3],
            metadata: TEST_METADATA,
            voters: {
                voter1: {
                    voteId: "vote-id-1",
                    vote: vote1
                },
                voter2: {
                    voteId: "vote-id-2",
                    vote: vote2
                },
                voter3: {
                    voteId: "vote-id-3",
                    vote: abstainVote
                }
            }
        });
    });

    it("should tally two votes", async function () {
        let res = await tally.tallyElection({
            electionAddress: config.contract.address,
            provider: "http://localhost:8545",
            version: 18,
            protoPath: "protocol/vote.proto",
            resultsUpdateCallback: (res) => {}
        });

        let ballotResults = res.ballots[config.contract.address];
        assert.equal(ballotResults.totalVotes, 3);
        assertResult(ballotResults.results["ALL"], [
            {
                "John Smith": 1,
                "Sally Gutierrez": 2,
                "Tyrone Williams": 1,
                "ABSTAIN": 1
            },
            {
                "Yes": 0,
                "No": 2,
                "ABSTAIN": 1
            },
            {
                "Red": 3,
                "Green": 3,
                "Blue": 6,
                "ABSTAIN": 1
            },
            {
                "Doug Hall": 4,
                "Emily Washington": 14,
                "ABSTAIN": 1
            }
        ])
    })
})

contract('Signature Checking Tally', function (accounts) {
    const election = require("../end-to-end/jslib/basic-election.js");

    let config;

    before(async ()=>{
        let vote1Json = {
            signatureSeed: uuid(),
            ballotVotes: [
                {
                    choices: [
                        {
                            selection: 2
                        },
                        {
                            selection: 1
                        },
                        {
                            selection: 0
                        }
                    ]
                }
            ]
        };

        let vote2Json = {
            signatureSeed: uuid(),
            ballotVotes: [
                {
                    choices: [
                        {
                            selection: 1
                        },
                        {
                            selection: 1
                        },
                        {
                            writeIn: "John Doe"
                        }
                    ]
                }
            ]
        };

        let encoded1 = await election.toEncodedVote(vote1Json);
        let base64Vote1 = encoded1.toString("base64");
        let sigResult1 = await election.signVote(base64Vote1);

        let encoded2 = await election.toEncodedVote(vote2Json);
        let base64Vote2 = encoded2.toString("base64");
        let sigResult2 = await election.signVote(base64Vote2);

        let mockSignatureObj = {
            "proof1": sigResult1,
            "proof2": sigResult2
        }

        tally.mockIpfsSignatures(mockSignatureObj);

        let vote1 = await election.toEncryptedVote(vote1Json);
        let vote2 = await election.toEncryptedVote(vote2Json);

        config = await election.doEndToEndElectionAutoActivate({
            account: {
                allowance: 3,
                owner: accounts[0]
            },
            netvote: accounts[1],
            admin: accounts[2],
            allowUpdates: false,
            autoActivate: true,
            submitWithProof: true,
            skipGasMeasurment:  true,
            gateway: accounts[3],
            metadata: "Qmc9oXZnUtcHoa7GxE7Ujwq4zG9SqSqKk5w9Qjqbi1cEWB",
            voters: {
                voter1: {
                    voteId: "vote-id-1",
                    vote: vote1,
                    proof: "proof1"
                },
                voter2: {
                    voteId: "vote-id-2",
                    vote: vote2,
                    proof: "proof2"
                }
            }
        });
    });

    it("should tally two votes", async function () {
        let res = await tally.tallyElection({
            electionAddress: config.contract.address,
            provider: "http://localhost:8545",
            version: 22,
            validateSignatures:true,
            protoPath: "protocol/vote.proto",
            resultsUpdateCallback: (res) => {}
        });

        let ballotResults = res.ballots[config.contract.address];
        assert.equal(ballotResults.totalVotes, 2);
        assertResult(ballotResults.results["ALL"], [
            {
                "John Smith": 0,
                "Sally Gutierrez": 1,
                "Tyrone Williams": 1
            },
            {
                "Yes": 0,
                "No": 2
            },
            {
                "Doug Hall": 1,
                "Emily Washington": 0,
                "WRITEIN-JOHN DOE": 1
            }
        ])
    })

});

contract('Basic Tally', function (accounts) {
    const election = require("../end-to-end/jslib/basic-election.js");

    let config;

    before(async ()=>{
        let vote1Json = {
            encryptionSeed: 12345,
            ballotVotes: [
                {
                    choices: [
                        {
                            selection: 2
                        },
                        {
                            selection: 1
                        },
                        {
                            selection: 0
                        }
                    ]
                }
            ]
        };
        let vote2Json = {
            encryptionSeed: 54321,
            ballotVotes: [
                {
                    choices: [
                        {
                            selection: 1
                        },
                        {
                            selection: 1
                        },
                        {
                            writeIn: "John Doe"
                        }
                    ]
                }
            ]
        };

        let vote1 = await election.toEncryptedVote(vote1Json);
        let vote2 = await election.toEncryptedVote(vote2Json);

        config = await election.doEndToEndElectionAutoActivate({
            account: {
                allowance: 3,
                owner: accounts[0]
            },
            netvote: accounts[1],
            admin: accounts[2],
            allowUpdates: false,
            autoActivate: true,
            skipGasMeasurment:  true,
            gateway: accounts[3],
            metadata: "Qmc9oXZnUtcHoa7GxE7Ujwq4zG9SqSqKk5w9Qjqbi1cEWB",
            voters: {
                voter1: {
                    voteId: "vote-id-1",
                    vote: vote1
                },
                voter2: {
                    voteId: "vote-id-2",
                    vote: vote2
                }
            }
        });
    });

    it("should tally two votes", async function () {
        let res = await tally.tallyElection({
            electionAddress: config.contract.address,
            provider: "http://localhost:8545",
            version: 18,
            protoPath: "protocol/vote.proto",
            resultsUpdateCallback: (res) => {}
        });

        let ballotResults = res.ballots[config.contract.address];
        assert.equal(ballotResults.totalVotes, 2);
        assertResult(ballotResults.results["ALL"], [
            {
                "John Smith": 0,
                "Sally Gutierrez": 1,
                "Tyrone Williams": 1
            },
            {
                "Yes": 0,
                "No": 2
            },
            {
                "Doug Hall": 1,
                "Emily Washington": 0,
                "WRITEIN-JOHN DOE": 1
            }
        ])
    })

});