"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const homepage=fs.readFileSync(path.join(root,"index.html"),"utf8");
const config=fs.readFileSync(path.join(root,"_config.yml"),"utf8");
const linkPattern=/\bhref="([^"]+)"/g;
const links=[...homepage.matchAll(linkPattern)].map(match=>match[1]).filter(link=>!link.startsWith("#"));

test("homepage has an explicit HTML document with a prominent cluster-lab link",()=>{
  assert.match(homepage,/<!doctype html>/i);
  assert.match(homepage,/<meta name="viewport"/);
  assert.match(homepage,/<h1>Learn by exploring\.<\/h1>/);
  assert.match(homepage,/id="lab-title"/);
  assert.ok((homepage.match(/href="scripts\/yarn_spark_cluster_lab\.html"/g)||[]).length>=2);
  assert.match(homepage,/@media\(max-width: 520px\)/);
});

test("Jekyll doesn't generate an index.md output that competes with index.html",()=>{
  assert.match(config,/\nexclude:\s*\n(?:\s*-[^\n]+\n)*\s*- index\.md\s*(?:\n|$)/);
});

test("each homepage link resolves to an existing source file",()=>{
  for (const link of links) {
    assert.ok(!link.startsWith("/")&&!link.includes(".."),"URL must be project-relative: "+link);
    assert.ok(link.endsWith(".html"),"Link must point to published HTML: "+link);
    const full=path.join(root,link);
    const markdown=full.replace(/\.html$/,".md");
    assert.ok(fs.existsSync(full)||fs.existsSync(markdown),"Missing source for "+link);
  }
});

test("catalog retains the original index.md references",()=>{
  const markdown=fs.readFileSync(path.join(root,"index.md"),"utf8");
  const refs=[...markdown.matchAll(/\]\((docs\/[^)]+|scripts\/[^)]+)\)/g)].map(m=>m[1]);
  for(const ref of refs) {
    const published=ref.replace(/\.md$/,".html");
    assert.ok(links.includes(published),"Original index entry not on homepage: "+ref);
  }
});
