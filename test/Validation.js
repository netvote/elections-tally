const assert = require('assert');
const tally = require("../tally")

const expectError = (fn) => {
    let thrown = false;
    try{
        fn()
    }catch(e){
        thrown=true;
    }finally{
        assert.equal(true, thrown, "expected error");
    }
}

describe("Single Choice Validation", function () {
    
    let metadata = [{
                "ballotItems": [{
                    "itemTitle": "One",
                }, {
                    "itemTitle": "Two",
                }, {
                    "itemTitle": "Three",
                }, {
                    "itemTitle": "Four",
                }]
    }]

    describe("valid", ()=>{
        it("should accept valid selections", () => {
            let validVotes = [0,1,2,3]
            validVotes.forEach((v) => {
                let choices = [{selection: v}]
                assert.equal(tally.validateChoices(choices, metadata), true);
            })
        })

        it("should accept writeIn", () => {
            let choices = [{
                writeIn: "John Doe"
            }]
            assert.equal(tally.validateChoices(choices, metadata), true);
        })

        it("should accept abstain", () => {
            let choices = [{
                abstain: true
            }]
            assert.equal(tally.validateChoices(choices, metadata), true);
        })
    });

    describe("invalid", ()=>{
        it("should reject out-of-range choice", () => {
            let choices = [{selection: 5}]
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject blank choice", () => {
            let choices = [{}]
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject multiple choice", () => {
            let choices = [{indexSelections: {indexes:[0,1]}}]
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
        
    })
});

describe("Multiple Choice Validation", function () {

    let metadata = [{
                "type": "multiple",
                "maxSelect": 3,
                "minSelect": 2,
                "ballotItems": [{
                    "itemTitle": "One",
                }, {
                    "itemTitle": "Two",
                }, {
                    "itemTitle": "Three",
                }, {
                    "itemTitle": "Four",
                }]
    }]

    describe("valid", ()=>{
        it("should accept valid votes", () => {
            let validVotes = [
                [0,1,2],
                [2,3]
            ]
            validVotes.forEach((v) => {
                let choices = [{indexSelections: {indexes:v}}]
                assert.equal(tally.validateChoices(choices, metadata), true);
            })
        })

        it("should accept abstain", () => {
            let choices = [{
                abstain: true
            }]
            assert.equal(tally.validateChoices(choices, metadata), true);
        })
    })

    describe("invalid", ()=>{
        it("should reject fewer than minVotes", () => {
            let choices = [{
                indexSelections: {
                    indexes: [1]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    
        it("should reject more than maxVotes", () => {
            let choices = [{
                indexSelections: {
                    indexes: [0, 1, 2, 3]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    })
    
});

describe("Points Allocation Validation", function () {

    let metadata = [{
                "type": "points",
                "totalPoints": 20,
                "ballotItems": [{
                    "itemTitle": "One",
                }, {
                    "itemTitle": "Two",
                }, {
                    "itemTitle": "Three",
                }, {
                    "itemTitle": "Four",
                }]
    }]

    describe("valid", ()=>{
        it("should accept valid votes", () => {
            let validVotes = [
                [5,5,5,5],
                [20,0,0,0],
                [5,10,5,0]
            ]
            validVotes.forEach((v) => {
                let choices = [{pointsAllocations: {points:v}}]
                assert.equal(tally.validateChoices(choices, metadata), true);
            })
        })

        it("should accept abstain", () => {
            let choices = [{
                abstain: true
            }]
            assert.equal(tally.validateChoices(choices, metadata), true);
        })
    })

    describe("invalid", ()=>{
        it("should reject not enough items", () => {
            let choices = [{
                pointsAllocations: {
                    points: [20,0,0]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    
        it("should reject too many items", () => {
            let choices = [{
                pointsAllocations: {
                    points: [0,0,0,0,20]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject too many points", () => {
            let choices = [{
                pointsAllocations: {
                    points: [6,6,6,6]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject too few points", () => {
            let choices = [{
                pointsAllocations: {
                    points: [4,4,4,4]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    })
    
});

describe("Ranked Choice Validation", function () {

    let metadata = [{
                "type": "ranked",
                "ballotItems": [{
                    "itemTitle": "One",
                }, {
                    "itemTitle": "Two",
                }, {
                    "itemTitle": "Three",
                }, {
                    "itemTitle": "Four",
                }]
    }]

    describe("valid", ()=>{
        it("should accept valid votes", () => {
            let validVotes = [
                [1,2,3,4],
                [2,3,1,4],
                [4,3,2,1]
            ]
            validVotes.forEach((v) => {
                let choices = [{pointsAllocations: {points:v}}]
                assert.equal(tally.validateChoices(choices, metadata), true);
            })
        })

        it("should accept abstain", () => {
            let choices = [{
                abstain: true
            }]
            assert.equal(tally.validateChoices(choices, metadata), true);
        })
    })

    describe("invalid", ()=>{
        it("should reject not enough items", () => {
            let choices = [{
                pointsAllocations: {
                    points: [1,2,3]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    
        it("should reject too many items", () => {
            let choices = [{
                pointsAllocations: {
                    points: [1,2,3,4,5]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject non-consecutive values", () => {
            let choices = [{
                pointsAllocations: {
                    points: [1,2,3,5]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })

        it("should reject zero", () => {
            let choices = [{
                pointsAllocations: {
                    points: [1,2,0,3]
                }
            }]
    
            expectError(()=>{tally.validateChoices(choices, metadata)});
        })
    })
    
});