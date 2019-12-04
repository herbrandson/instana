const fs = require('fs');
const assert = require('assert');
const {it} = require('mocha');

const STOP = -1;
const CONTINUE = 0;
const INCLUDE = 1;

const graph = parse('./data.csv');

function parse(path) {
	const results = {};
	const data = fs.readFileSync(path).toString().split(',');

	for (const trace of data) {
		// Assumes that the input is in a valid format
		const start = trace[0];
		const end = trace[1];
		const latency = +trace.substr(2);

		if (!results[start]) results[start] = {};
		results[start][end] = latency;
	}

	return results;
}

function getLatency(graph, path) {
	let result = 0;

	// Walk the path and sum latencies
	for (let i = 1; i < path.length; i++) {
		const start = path[i - 1];
		const end = path[i];
		const parent = graph[start] || {};
		const latency = parent[end];
		if (latency == null) return 'NO SUCH TRACE'

		result += latency;
	}

	return result;
}

function find(graph, startKey, predicate) {
	return recurse(graph, startKey, [startKey], 0, [], predicate);
}

function recurse(graph, startKey, startPath, startLatency, results, predicate) {
	const parent = graph[startKey] || {};

	for (const [endKey, meanLatency] of Object.entries(parent)) {
		const latency = startLatency + meanLatency;
		const path = startPath.slice(0); // clones startPath
		path.push(endKey);
		const result = {path, latency};

		// Pass the current result to the provided "predicate", which will return one
		// of the following values: STOP, INCLUDE, or CONTINE
		const status = predicate(result, startKey, endKey);

		// If the predicate returned STOP, abort traversal
		if (status === STOP) continue;

		// If the predicate returned INCLUDE, add this item to the returned results
		if (status === INCLUDE) results.push(result);

		// If the predicate returned INCLUDE or CONTINUE, recursively walk the graph
		recurse(graph, endKey, path, latency, results, predicate);
	}

	return results;
}

// Begin Tests
it('Can parse csv data', () => {
	assert.deepEqual(graph, {
		A: {
			B: 5,
			D: 5,
			E: 7,
		},
		B: {
			C: 4,
		},
		C: {
			D: 8,
			E: 2,
		},
		D: {
			C: 8,
			E: 6,
		},
		E: {
			B: 3,
		}
	});
});

it('The average latency of the trace A-B-C', () => {
	const result = getLatency(graph, ['A', 'B', 'C']);
	assert.equal(result, 9);
});

it('The average latency of the trace A-D', () => {
	const result = getLatency(graph, ['A', 'D']);
	assert.equal(result, 5);
});

it('The average latency of the trace A-D-C', () => {
	const result = getLatency(graph, ['A', 'D', 'C']);
	assert.equal(result, 13);
});

it('The average latency of the trace A-E-B-C-D', () => {
	const result = getLatency(graph, ['A', 'E', 'B', 'C', 'D']);
	assert.equal(result, 22);
});

it('The average latency of the trace A-E-D', () => {
	const result = getLatency(graph, ['A', 'E', 'D']);
	assert.equal(result, 'NO SUCH TRACE');
});

it('The number of traces originating in service C and ending in service C with a maximum of 3 hops', () => {
	const results = find(graph, 'C', predicate);

	assert.equal(results.length, 2);
	assert.deepEqual(results, [
		{latency: 16, path: ['C', 'D', 'C']},
		{latency: 09, path: ['C', 'E', 'B', 'C']},
	]);

	function predicate({path, latency}, startKey, endKey) {
		// Paths longer then 4 have more than 3 hops
		if (path.length > 4) return STOP;
		if (endKey === 'C') return INCLUDE;
		return CONTINUE;
	}
});

it('The number of traces originating in A and ending in C with exactly 4 hops', () => {
	const results = find(graph, 'A', predicate);

	assert.equal(results.length, 3);
	assert.deepEqual(results, [
		{latency: 25, path: ['A', 'B', 'C', 'D', 'C']},
		{latency: 29, path: ['A', 'D', 'C', 'D', 'C']},
		{latency: 18, path: ['A', 'D', 'E', 'B', 'C']},
	]);

	function predicate({path, latency}, startKey, endKey) {
		// Paths longer then 5 have more than 4 hops
		if (path.length > 5) return STOP;
		if (path.length === 5 && endKey === 'C') return INCLUDE;
		return CONTINUE;
	}
});

it('The length of the shortest trace (in terms of latency) between A and C.', () => {
	let min = Number.POSITIVE_INFINITY;
	const results = find(graph, 'A', predicate);

	assert.equal(min, 9);
	assert.deepEqual(results, [
		{latency: 9, path: ['A', 'B', 'C']},
	]);

	function predicate({path, latency}, startKey, endKey) {
		// If the current latency is greater than the current min, abort this branch
		if (latency >= min) return STOP;

		if (endKey === 'C') {
			min = latency;
			return INCLUDE;
		}

		return CONTINUE;
	}
});

it('The length of the shortest trace (in terms of latency) between B and B.', () => {
	let min = Number.POSITIVE_INFINITY;
	const results = find(graph, 'B', predicate);

	assert.equal(min, 9);
	assert.deepEqual(results, [
		{latency: 25,path: ['B', 'C', 'D', 'C','E','B']},
		{latency: 21,path: ['B', 'C', 'D', 'E','B']},
		{latency: 9,path: ['B', 'C', 'E', 'B']}
	]);

	function predicate({path, latency}, startKey, endKey) {
		// Breaks infinite loop checks that repeat already tested connections
		if (path[path.length - 4] === startKey && path[path.length - 3] === endKey) return STOP;

		// If the current latency is greater than the current min, abort this branch
		if (latency >= min) return STOP;

		if (endKey === 'B') {
			min = latency;
			return INCLUDE;
		}

		return CONTINUE;
	}
});

it('The number of different traces from C to C with an average latency of less than 30', () => {
	const results = find(graph, 'C', predicate);

	assert.equal(results.length, 7);
	assert.deepEqual(results, [
		{latency: 16, path: [ 'C', 'D', 'C']},
		{latency: 25, path: [ 'C', 'D', 'C', 'E', 'B', 'C']},
		{latency: 21, path: [ 'C', 'D', 'E', 'B', 'C']},
		{latency: 09, path: [ 'C', 'E', 'B', 'C']},
		{latency: 25, path: [ 'C', 'E', 'B', 'C', 'D', 'C']},
		{latency: 18, path: [ 'C', 'E', 'B', 'C', 'E', 'B', 'C']},
		{latency: 27, path: [ 'C', 'E', 'B', 'C', 'E', 'B', 'C', 'E', 'B', 'C']},
	]);

	function predicate({path, latency}, startKey, endKey) {
		if (latency >= 30) return STOP;
		if (endKey === 'C') return INCLUDE;
		return CONTINUE;
	}
});
