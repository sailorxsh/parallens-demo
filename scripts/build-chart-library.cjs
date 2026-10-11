// Manual vendor rebuild; normal site publication uses the checked-in bundle.
const fs=require('node:fs');
const path=require('node:path');
const modules=process.argv[2]&&path.resolve(process.argv[2]);
if(!modules)throw new Error('Pass the node_modules directory containing the pinned build dependencies.');
const versions={echarts:'5.5.1',zrender:'5.6.0',tslib:'2.3.0',esbuild:'0.25.11'};
for(const [name,version] of Object.entries(versions)) {
  const actual=JSON.parse(fs.readFileSync(path.join(modules,name,'package.json'),'utf8')).version;
  if(actual!==version)throw new Error(`${name}: expected ${version}, found ${actual}`);
}
const {build}=require(path.join(modules,'esbuild'));
const notices=[['Apache ECharts',path.join(modules,'echarts','NOTICE')],
  ['Apache License 2.0',path.join(modules,'echarts','LICENSE')],
  ['ZRender BSD 3-Clause License',path.join(modules,'zrender','LICENSE')]];
const banner='/*!\nParallens SVG chart bundle. ECharts 5.5.1 / ZRender 5.6.0.\n'+
  notices.map(([title,file])=>`${title}\n${fs.readFileSync(file,'utf8')}`).join('\n')+'\n*/';
build({entryPoints:[path.join(__dirname,'chart-library-entry.mjs')],
  nodePaths:[modules],outfile:path.join(__dirname,'..','vendor','echarts.min.js'),
  bundle:true,format:'iife',globalName:'echarts',minify:true,target:['es2018'],
  legalComments:'eof',banner:{js:banner},define:{'process.env.NODE_ENV':'"production"'},write:false
}).then(result=>{
  const output=result.outputFiles[0],text=output.text;
  const footer=text.lastIndexOf('/*! Bundled license information:');
  // Trim whitespace only in generated license comments, without touching program strings.
  fs.writeFileSync(output.path,footer<0?text:text.slice(0,footer)+text.slice(footer).replace(/[ \t]+$/gm,''));
}).catch(error=>{console.error(error);process.exitCode=1;});
