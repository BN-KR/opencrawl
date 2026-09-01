const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=__dirname,port=Number(process.env.PORT||4173),historyFile=path.join(root,'output','history.json');let crawl=null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const readHistory=()=>fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile,'utf8')):[];
const writeHistory=h=>{fs.mkdirSync(path.dirname(historyFile),{recursive:true});fs.writeFileSync(historyFile,JSON.stringify(h.slice(-25),null,2))};
const reply=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(body):body)};
function serve(res,u){let p=decodeURIComponent(u.split('?')[0]);if(p==='/')p='/index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return reply(res,404,'Not found','text/plain');reply(res,200,fs.readFileSync(f),mime[path.extname(f)]||'application/octet-stream')}
const server=http.createServer((req,res)=>{
 if(req.method==='GET'&&req.url==='/api/status')return reply(res,200,{active:Boolean(crawl&&!crawl.complete),...(crawl||{}),history:readHistory()});
 if(req.method==='GET'&&req.url==='/api/history')return reply(res,200,readHistory());
 if(req.method==='POST'&&req.url==='/api/crawl'){let b='';req.on('data',x=>b+=x);req.on('end',()=>{try{const input=JSON.parse(b),raw=String(input.url||'').trim(),target=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);if(crawl&&!crawl.complete)return reply(res,409,{error:'A crawl is already running.'});const id=Date.now().toString(36),output=path.join(root,'output',id);fs.mkdirSync(output,{recursive:true});crawl={id,url:target.toString(),startedAt:new Date().toISOString(),output,phase:'launching'};const child=spawn(process.execPath,['crawler.js','--url',target.toString(),'--max-pages',String(Math.min(100,Math.max(1,Number(input.maxPages)||10))),'--output',output],{cwd:root,windowsHide:true});crawl.pid=child.pid;child.stdout.on('data',d=>crawl.phase=d.toString().trim().split(/\r?\n/).pop()||crawl.phase);child.stderr.on('data',d=>crawl.error=d.toString().trim());child.on('close',code=>{crawl={...crawl,complete:true,code,finishedAt:new Date().toISOString(),phase:code===0?'complete':'failed'};const h=readHistory();h.push({...crawl});writeHistory(h)});return reply(res,202,{started:true,id,url:target.toString()})}catch(e){return reply(res,400,{error:e.message})}});return}
 if(req.method==='GET'&&req.url.endsWith('/'))return serve(res,`${req.url}pages/index.html`);
 serve(res,req.url);
});server.listen(port,'127.0.0.1',()=>console.log(`OpenCrawl running at http://localhost:${port}`));
