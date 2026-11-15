import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {reviewTrophyPeerBenchmark} from '../src/lib/trophyPeerBenchmarkReview';

test('Colorado Unit 40 compares each observed cutoff to the right season and pool',()=>{
  const h={state:'CO',species:'DEER',year:2026,code:'DM040O3R',measure:'Observed cutoff points' as const};
  const third=reviewTrophyPeerBenchmark({...h,pool:'Nonresident',value:14});
  assert.equal(third?.cohort,'Rifle season 3 / male');
  assert.equal(third?.peers,61);assert.equal(third?.p75,11);assert.equal(third?.p90,20);
  assert.equal(third?.high,true);assert.equal(third?.exceptional,false);
  const fourth=reviewTrophyPeerBenchmark({...h,code:'DM040O4R',pool:'Nonresident',value:28});
  assert.equal(fourth?.p90,25);
  assert.equal(fourth?.exceptional,true);
  const resident=reviewTrophyPeerBenchmark({...h,pool:'Resident',value:4});
  assert.equal(resident?.p90,9);
  assert.equal(resident?.exceptional,false);
});

test('outdated, changed and unsupported inputs never borrow another benchmark',()=>{
  const h={state:'CO',species:'DEER',year:2026,code:'DM040O3R',pool:'Nonresident' as const,measure:'Observed cutoff points' as const,value:14};
  assert.equal(reviewTrophyPeerBenchmark({...h,year:2025}),null);
  assert.equal(reviewTrophyPeerBenchmark({...h,value:20}),null);
  assert.equal(reviewTrophyPeerBenchmark({...h,pool:'Resident'}),null);
  assert.equal(reviewTrophyPeerBenchmark({...h,state:'WA'}),null);
  assert.equal(reviewTrophyPeerBenchmark({...h,value:NaN}),null);
});

test('Wyoming regular preference points are compared within their own pool',()=>{
  const h={state:'WY',species:'ELK',year:2026,code:'E30-1',pool:'NR Regular' as const,measure:'Observed cutoff points' as const,value:20};
  const r=reviewTrophyPeerBenchmark(h);
  assert.equal(r?.peers,64);assert.equal(r?.p90,20);assert.equal(r?.exceptional,true);
  assert.equal(reviewTrophyPeerBenchmark({...h,pool:'Resident'}),null);
});
