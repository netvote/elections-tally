const rp = require('request-promise-native');
const contract = require('truffle-contract');
const Web3 = require("web3");

const contractCache = {}
const abiDecoderCache = {}
let web3Provider;
let web3Defaults;

const toContractUrl = (name, version) => {
    return `https://s3.amazonaws.com/netvote-election-contracts/${version}/${name}.json`
}

const checkInit = () => {
    if(!web3Provider) {
        throw "web3Provider is undefined, Init not called."
    }
}

const getAbiDecoder = async (name, version) => {
    checkInit();
    const url = toContractUrl(name, version);
    if(abiDecoderCache[url]) {
        return abiDecoderCache[url]
    }
    const abiDecoder = require('abi-decoder');
    const contractJson = await rp(url, { json: true })
    abiDecoder.addABI(contractJson.abi);
    abiDecoderCache[url] = abiDecoder;
    return abiDecoder;
};

const getAbi = async (name, version) => {
    checkInit();
    const url = toContractUrl(name, version);
    if(contractCache[url]) {
        return contractCache[url]
    }
    const c = contract(await rp(url, { json: true }))
    c.setProvider(web3Provider)
    c.defaults(web3Defaults);
    contractCache[url] = c;
    return c;
}

const extractVoteFromTx = (txId, version) => {
    checkInit();
    return new Promise(async (resolve, reject) => {
        web3.eth.getTransaction(txId,
            (err, res) => {
                let decoder = getAbiDecoder("BasePool", version)
                let txObj = decoder.decodeMethod(res.input);
                resolve( {
                    pool: res.to,
                    voteId: txObj.params[0].value,
                    vote: txObj.params[1].value,
                    passphrase: txObj.params[2].value
                });
            });
    });
}

module.exports = {
    Init: (ethUrl) => {
        web3Provider = new Web3.providers.HttpProvider(ethUrl);
        web3 = new Web3(web3Provider);
    },
    web3: () => {
        checkInit();
        return web3;
    },
    extractVoteFromTx: (txId, version) => {
         return extractVoteFromTx(txId, version);
    },
    AbiDecoder: (name, version) =>{
        return getAbiDecoder(name, version);
    },
    BasicElection: (version) => {
        return getAbi("BasicElection", version)
    },
    BaseElection: (version) => {
        return getAbi("BaseElection", version)
    },
    BasePool: (version) => {
        return getAbi("BasePool", version)
    },
    BaseBallot: (version) => {
        return getAbi("BaseBallot", version)
    },
    TieredElection: (version) => {
        return getAbi("TieredElection", version)
    },
    TieredPool: (version) => {
        return getAbi("TieredPool", version)
    },
    TieredBallot: (version) => {
        return getAbi("TieredBallot", version)
    },
    ElectionPhaseable: (version) => {
        return getAbi("ElectionPhaseable", version)
    },
    KeyHolder: (version) => {
        return getAbi("KeyHolder", version)
    }
}