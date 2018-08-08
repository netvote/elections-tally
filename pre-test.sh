rm -rf elections-solidity
git clone https://github.com/netvote/elections-solidity.git
mkdir elections-solidity/test/tally
cp service_tests/*.js elections-solidity/test/tally
cd elections-solidity
npm install
ganache-cli --gasLimit 200000000 2> /dev/null 1> /dev/null &
sleep 5
truffle test --network testing test/tally/Tally.js
killall ganache-cli || true