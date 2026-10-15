"use strict";
/**
 * Offline regression tests for the deliberately simplified YARN/Spark lab.
 * Run: node --test scripts/tests/yarn_spark_cluster_lab.test.cjs
 * No network access or npm packages required.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const labPath=path.join(__dirname,"..","yarn_spark_cluster_lab.html");
const html=fs.readFileSync(labPath,"utf8");
const source=html.split("<script>")[1]?.split("</script>")[0];
assert.ok(source,"HTML should contain its inline simulation script");
new Function(source); // compile-time syntax validation

function makeLab() {
 const els={};
 const document={
  getElementById(id){
   return els[id]??=( {id,innerHTML:"",textContent:"",value:"",className:"",
    addEventListener(){},querySelectorAll(){return [];}} );
  },
  querySelectorAll(){return [];}
 };
 const exposed=source.replace("(function(){","return (function(){")
  .replace(' renderProperties();scenario("default");',
   ' renderProperties();scenario("default");return {simulate,defaults,presets,scenario,workloadPreset,render};');
 assert.ok(exposed.includes("return {simulate,defaults"),"Simulation test hooks should be injected");
 const lab=new Function("document",exposed)(document);
 return {lab,els};
}
const {lab,els}=makeLab();
const settings=(name,extra={})=>Object.assign({},lab.defaults,lab.presets[name]||{},extra);
const simulate=(name,step=5,extra={})=>{
 const s=settings(name,extra);
 return lab.simulate(s,lab.workloadPreset(name,s),step);
};

test("HTML includes offline resources, scenario presets and mobile breakpoints",()=>{
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/@media\(max-width:830px\)/);
 assert.match(html,/id="workloadRows"/);
 assert.match(html,/id="tickSlider"/);
 assert.match(html,/id="importFile"/);
 assert.match(html,/data-view="reference"/);
 assert.match(html,/r3\.3\.6/);
 assert.ok(!/<script[^>]+src=/.test(html),"Simulator JavaScript is self-contained");
});

test("all nine presets render and respect node/queue boundaries",()=>{
 for(const name of Object.keys(lab.presets)){
  lab.scenario(name);
  assert.ok(els.nodes.innerHTML.includes("worker-01"),name+": missing node diagram");
  assert.ok(els.workloadRows.innerHTML.includes("app-001"),name+": missing workload editor");
  assert.ok(els["queue-chart"].innerHTML.includes("Finance"),name+": missing queue diagram");
  const r=simulate(name,name==="preempt"?4:5);
  assert.deepEqual(r.errors,[],name+": config errors");
  for(const n of r.nodes){assert.ok(n.freeMb>=0&&n.freeC>=0,name+": oversubscribed node");}
  for(const q of Object.values(r.root)){
   assert.ok(q.usedMb<=q.max*r.totalMb+1e-6,name+": "+q.id+" over maximum memory");
   assert.ok(q.usedC<=q.max*r.totalC+1e-6,name+": "+q.id+" over maximum vcores");
  }
 }
});

test("AM cap stops applications before executors exist",()=>{
 const r=simulate("am");
 assert.equal(r.amPlaced,0);
 assert.equal(r.execPlaced,0);
 assert.ok(r.apps.every(a=>a.state==="ACCEPTED"));
 assert.match(r.apps[0].reason,/AM resource percent/);
});

test("oversized executors cannot be placed",()=>{
 const r=simulate("oversized");
 assert.equal(r.amPlaced,1);
 assert.equal(r.execPlaced,0);
 assert.match(r.apps[0].reason,/maximum allocation/);
});

test("per-user limit prevents monopolisation",()=>{
 const r=simulate("user");
 assert.ok(r.apps.some(a=>/Per-user limit/.test(a.reason)));
});

test("queue-specific max-parallel-apps does not globally block other queues",()=>{
 const r=simulate("default",5,{maxParallel:1});
 assert.equal(r.apps.filter(a=>a.queue==="finance"&&a.state==="RUNNING").length,1);
 assert.equal(r.apps.find(a=>a.queue==="analytics").state,"RUNNING");
 assert.equal(r.apps.find(a=>a.queue==="engineering").state,"RUNNING");
});

test("nested analytics parent totals equal child totals and enforce parent bound",()=>{
 const r=simulate("nested");
 assert.equal(r.root.analytics.usedMb,r.leafs["analytics.batch"].usedMb+r.leafs["analytics.adhoc"].usedMb);
 assert.ok(r.root.analytics.usedMb<=r.root.analytics.max*r.totalMb);
 assert.equal(r.leafs["analytics.batch"].g+r.leafs["analytics.adhoc"].g,r.root.analytics.g);
});

test("node labels constrain executor placement without constraining AM placement",()=>{
 const r=simulate("labels");
 assert.ok(r.amPlaced>0);
 for(const n of r.nodes){
  for(const con of n.containers){
   if(con.app==="app-001"&&con.type==="exec")assert.equal(n.label,"gpu");
  }
 }
 assert.ok(r.apps.find(a=>a.id==="app-001").placed<=Math.floor((r.nodeC-r.am.cores)/r.apps[0].ex.cores));
});

test("late jobs arrive at step 4 and preemption redistributes borrowed resources",()=>{
 const before=simulate("preempt",4);
 const after=simulate("preempt",5);
 assert.equal(before.apps[1].placed,0);
 assert.ok(after.apps[1].placed>before.apps[1].placed);
 assert.ok(after.reclaimed>0);
 assert.match(after.events[0].title,/Preemption/);
});

test("disabled preemption leaves allocations unchanged across steps 4 and 5",()=>{
 const before=simulate("preempt",4,{preempt:false});
 const after=simulate("preempt",5,{preempt:false});
 assert.equal(before.execPlaced,after.execPlaced);
 assert.equal(after.reclaimed,0);
});

test("dynamic allocation starts at initial target and later scales toward task demand",()=>{
 const early=simulate("dynamic",2);
 const later=simulate("dynamic",3);
 assert.ok(early.apps[0].target<=later.apps[0].target);
 assert.ok(later.apps[0].target<=settings("dynamic").dynMax);
});

test("invalid queue guarantee sums are warned rather than silently normalised",()=>{
 const r=simulate("default",5,{queuePct:75,analyticsPct:50});
 assert.ok(r.errors.some(x=>/positive Engineering guarantee/.test(x)));
});

test("queue state and client mode respect submission and AM semantics",()=>{
 const stopped=simulate("default",5,{queueState:"STOPPED"});
 assert.equal(stopped.apps.filter(a=>a.queue==="finance"&&a.state==="RUNNING").length,0);
 const client=simulate("default",5,{deploy:"client"});
 assert.equal(client.am.rawMem,client.amRaw);
 assert.ok(client.notices.some(x=>/Client mode/.test(x)));
});

test("large label requirement cannot fit on worker without that label",()=>{
 const r=simulate("labels",5,{gpuNodes:0});
 assert.equal(r.apps[0].placed,0);
 assert.match(r.apps[0].reason,/label/);
});

test("reducing available memory or vcores does not oversubscribe nodes",()=>{
 for(const cores of [4,8,16]){
  for(const ram of [16,32,64]){
   const r=simulate("default",5,{ram,cores});
   assert.ok(r.nodes.every(n=>n.freeMb>=0&&n.freeC>=0),ram+"GB, "+cores+"cores");
  }
 }
});
