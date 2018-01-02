.PHONY: abi

abi:
	rm -rf abi
	mkdir abi
	cp ../elections-solidity/build/contracts/* abi
