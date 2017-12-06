.PHONY: abi

abi:
	rm -rf abi
	mkdir abi
	cp ../elections/build/contracts/* abi
