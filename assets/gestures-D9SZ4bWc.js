import{B as e,H as t,L as n,R as r,U as i,V as a,W as o,Y as s,ot as c,q as l,z as u}from"./index-Ck7uOKvi.js";var d={name:`arrow-left`,size:24,node:[[`path`,{d:`m12 19-7-7 7-7`,key:`1l729n`}],[`path`,{d:`M19 12H5`,key:`x3x0zl`}]]};d.node;var f=c(d),p={name:`sparkles`,size:24,node:[[`path`,{d:`M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z`,key:`1s2grr`}],[`path`,{d:`M20 2v4`,key:`1rf3ol`}],[`path`,{d:`M22 4h-4`,key:`gwowj6`}],[`circle`,{cx:`4`,cy:`20`,r:`2`,key:`6kqj1y`}]],aliases:[`stars`]};p.node;var m=c(p),h=(e,t)=>String.fromCharCode(e.getUint8(t),e.getUint8(t+1),e.getUint8(t+2),e.getUint8(t+3));function g(e){let t=e*137.508%360/60,n=.35+e*7%5*.08,r=(1-Math.abs(2*n-1))*.65,i=r*(1-Math.abs(t%2-1)),a=n-r/2,[o,s,c]=t<1?[r,i,0]:t<2?[i,r,0]:t<3?[0,r,i]:t<4?[0,i,r]:t<5?[i,0,r]:[r,0,i];return[(o+a)*255,(s+a)*255,(c+a)*255]}function _(e){let t=e.byteLength,n=new DataView(e);if(t<8||h(n,0)!==`VOX `)throw Error(`Not a MagicaVoxel file: missing "VOX " header`);if(t<20||h(n,8)!==`MAIN`)throw Error(`Invalid .vox file: missing MAIN chunk`);let r=n.getUint32(12,!0),i=n.getUint32(16,!0),a=20+r,o=a+i;if(o>t)throw Error(`Invalid .vox file: truncated MAIN chunk`);let s=null,c=null,u=null;for(;a+12<=o;){let t=h(n,a),r=n.getUint32(a+4,!0),i=n.getUint32(a+8,!0),l=a+12;if(l+r+i>o)throw Error(`Invalid .vox file: truncated ${JSON.stringify(t)} chunk`);switch(t){case`SIZE`:if(!s){if(r<12)throw Error(`Invalid .vox file: SIZE chunk too small`);s=[n.getInt32(l,!0),n.getInt32(l+4,!0),n.getInt32(l+8,!0)]}break;case`XYZI`:if(!c){if(!s)throw Error(`Invalid .vox file: XYZI chunk before SIZE`);if(r<4)throw Error(`Invalid .vox file: XYZI chunk too small`);let e=n.getUint32(l,!0);if(4+e*4>r)throw Error(`Invalid .vox file: XYZI voxel count exceeds chunk size`);c={offset:l+4,count:e}}break;case`RGBA`:!u&&r>=1024&&(u=new Uint8Array(e,l,1024))}a=l+r+i}if(!s)throw Error(`Invalid .vox file: missing SIZE chunk`);let[d,f,p]=s;if(d<1||f<1||p<1)throw Error(`Invalid .vox model size ${d}×${f}×${p}`);if(d>256||f>256||p>256)throw Error(`Model is ${d}×${f}×${p}; at most 256 voxels per axis are supported`);if(!c)throw Error(`Invalid .vox file: missing XYZI chunk`);let m=d,_=p,v=f,y=new Uint8Array(m*_*v),b=new Uint8Array(e),x=new Uint8Array(256);for(let e=0,t=c.offset;e<c.count;e++,t+=4){let e=b[t],n=b[t+1],r=b[t+2],i=b[t+3];i===0||e>=d||n>=f||r>=p||(y[e+m*(r+_*(f-1-n))]=i,x[i]=1)}let S=new Uint8Array(256),C=[];for(let e=1;e<256;e++){if(!x[e])continue;let t=u?[u[(e-1)*4],u[(e-1)*4+1],u[(e-1)*4+2]]:g(e);C.push(l(t)),S[e]=C.length}let w=new Uint8Array(y.length);for(let e=0;e<y.length;e++){let t=y[e];t!==0&&(w[e]=S[t])}return{type:`voxels`,width:m,height:_,depth:v,voxels:w,palette:C}}function v(e,t,n,r,a){for(let[r,i]of[[`width`,e],[`height`,t],[`depth`,n]])if(!Number.isInteger(i)||i<1||i>256)throw Error(`Cannot write .vox: ${r} ${i} is outside 1…256`);let c=e*t*n;if(r.length<c)throw Error(`Cannot write .vox: cells array is too short`);let l=a.map(o),u=Math.min(255,l.length),d=new Uint8Array(l.length+1);for(let e=0;e<u;e++)d[e+1]=e+1;if(l.length>255){let e=l.slice(0,255).map(e=>s(e));for(let t=255;t<l.length;t++){let n=s(l[t]),r=0,a=1/0;e.forEach((e,t)=>{let o=i(n,e);o<a&&(a=o,r=t)}),d[t+1]=r+1}}let f=0;for(let e=0;e<c;e++){let t=r[e];t>0&&t<=l.length&&f++}let p=24+(16+f*4)+1036,m=new ArrayBuffer(20+p),h=new DataView(m),g=new Uint8Array(m),_=0,v=e=>{for(let t=0;t<4;t++)g[_+t]=e.charCodeAt(t);_+=4},y=e=>{h.setUint32(_,e,!0),_+=4},b=(e,t,n)=>{v(e),y(t),y(n)};v(`VOX `),y(150),b(`MAIN`,0,p),b(`SIZE`,12,0),y(e),y(n),y(t),b(`XYZI`,4+f*4,0),y(f);for(let i=0;i<n;i++)for(let a=0;a<t;a++)for(let o=0;o<e;o++){let s=r[o+e*(a+t*i)];s===0||s>l.length||(g[_]=o,g[_+1]=n-1-i,g[_+2]=a,g[_+3]=d[s],_+=4)}b(`RGBA`,1024,0);for(let e=0;e<256;e++){let t=e<u?l[e]:[0,0,0];g[_]=t[0],g[_+1]=t[1],g[_+2]=t[2],g[_+3]=255,_+=4}return m}var y=200,b=class{project;targets;colorDone;done=0;undoStack=[];redoStack=[];stroke=null;listeners=new Set;fillListeners=new Set;snapshot;version=0;scratch=[];constructor(t){this.project=t,this.targets=r(t),e(t,this.targets),this.colorDone=new Uint32Array(this.targets.colorTotals.length);let{filled:n}=t,{color:i}=this.targets;for(let e=0;e<n.length;e++)n[e]&&i[e]?(this.colorDone[i[e]]++,this.done++):n[e]&&(n[e]=0);this.snapshot=this.makeSnapshot()}get total(){return this.targets.total}get complete(){return this.targets.total>0&&this.done>=this.targets.total}isColorComplete(e){return this.colorDone[e]===this.targets.colorTotals[e]}nextIncompleteColor(e){let t=this.project.palette.length;for(let n=1;n<=t;n++){let r=(e-1+n)%t+1;if(!this.isColorComplete(r))return r}return null}findUnfilled(e,t=-1){let{filled:n}=this.project,{color:r,count:i}=this.targets;for(let a=1;a<=i;a++){let o=(t+a+i)%i;if(r[o]===e&&!n[o])return o}return-1}colorAt(e){return this.targets.color[e]??0}isFilled(e){return this.project.filled[e]===1}beginStroke(){this.stroke=[]}fill(e,t){return e<0||e>=this.targets.count||this.targets.color[e]!==t||this.project.filled[e]?!1:(this.project.filled[e]=1,this.colorDone[t]++,this.done++,this.stroke?this.stroke.push(e):this.pushHistory([e]),this.emitFill([e],!0),!0)}floodFill(e,t){if(this.targets.color[e]!==t||this.project.filled[e])return 0;let n=[],r=[e],i=new Set([e]);for(;r.length>0;){let e=r.pop();if(!this.project.filled[e]){this.project.filled[e]=1,n.push(e),a(this.project,this.targets,e,this.scratch);for(let e of this.scratch)i.has(e)||(i.add(e),r.push(e))}}return this.colorDone[t]+=n.length,this.done+=n.length,this.stroke?this.stroke.push(...n):this.pushHistory(n),this.emitFill(n,!0),n.length}endStroke(){let e=this.stroke;this.stroke=null,e&&e.length>0?this.pushHistory(e):this.notify()}cancelStroke(){let e=this.stroke;this.stroke=null,e&&e.length>0&&this.setFilled(e,!1),this.notify()}undo(){let e=this.undoStack.pop();e&&(this.redoStack.push(e),this.setFilled(e,!1),this.notify())}redo(){let e=this.redoStack.pop();e&&(this.undoStack.push(e),this.setFilled(e,!0),this.notify())}reset(){this.project.filled.fill(0),this.colorDone.fill(0),this.done=0,this.undoStack=[],this.redoStack=[],this.emitFill([],!1),this.notify()}fillAll(){let e=[],{filled:t}=this.project;for(let n=0;n<t.length;n++){let r=this.targets.color[n];r&&!t[n]&&(t[n]=1,this.colorDone[r]++,e.push(n))}this.done+=e.length,this.pushHistory(e),this.emitFill(e,!0)}onFill(e){return this.fillListeners.add(e),()=>this.fillListeners.delete(e)}subscribe=e=>(this.listeners.add(e),()=>this.listeners.delete(e));getSnapshot=()=>this.snapshot;setFilled(e,t){let{filled:n}=this.project,r=[];for(let i of e){if(!!n[i]===t)continue;n[i]=+!!t;let e=this.targets.color[i];this.colorDone[e]+=t?1:-1,this.done+=t?1:-1,r.push(i)}this.emitFill(r,t)}pushHistory(e){e.length!==0&&(this.undoStack.push(e),this.undoStack.length>y&&this.undoStack.shift(),this.redoStack=[],this.notify())}emitFill(e,t){for(let n of this.fillListeners)n(e,t);this.stroke&&this.notify()}makeSnapshot(){return{version:this.version,done:this.done,total:this.targets.total,canUndo:this.undoStack.length>0,canRedo:this.redoStack.length>0,complete:this.complete}}notify(){this.version++,this.snapshot=this.makeSnapshot();for(let e of this.listeners)e()}};function x(e,t,n){let r=e.createProgram(),i=[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]];for(let[t,n]of i){let i=e.createShader(t);if(e.shaderSource(i,n),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS)&&!e.isContextLost()){let t=e.getShaderInfoLog(i);throw e.deleteShader(i),Error(`Shader compile failed: ${t??`unknown error`}`)}e.attachShader(r,i),e.deleteShader(i)}if(e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS)&&!e.isContextLost())throw Error(`Program link failed: ${e.getProgramInfoLog(r)??`unknown error`}`);return r}function S(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let i=0;i<r;i++){let r=e.getActiveUniform(t,i);r&&(n[r.name.replace(/\[0\]$/,``)]=e.getUniformLocation(t,r.name))}return n}function C(e,t,n,r,{internalFormat:i,format:a,type:o,filter:s=e.NEAREST}){let c=e.createTexture();return e.bindTexture(e.TEXTURE_2D,c),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,i,t,n,0,a,o,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,s),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,s),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),c}var w=`
uniform sampler2D u_glyphs;
uniform mat3 u_vision;

const float GLYPH_ASPECT = 0.6667;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 vision(vec3 c) { return toSrgb(u_vision * toLinear(c)); }

float easeOutBack(float t) {
  float c1 = 1.70158;
  float c3 = c1 + 1.0;
  return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Coverage of the number n (1–999) centered in a unit cell; uv has y pointing down.
float numberMask(int n, vec2 uv, vec2 dx, vec2 dy) {
  int count = n >= 100 ? 3 : (n >= 10 ? 2 : 1);
  float h = count == 3 ? 0.40 : 0.50;
  float tw = h * GLYPH_ASPECT * float(count);
  vec2 o = vec2(0.5 - tw * 0.5, 0.5 - h * 0.5);
  vec2 p = (uv - o) / vec2(tw, h);
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  float fx = p.x * float(count);
  int k = min(int(fx), count - 1);
  int divisor = k == count - 1 ? 1 : (k == count - 2 ? 10 : 100);
  int digit = (n / divisor) % 10;
  vec2 auv = vec2((float(digit) + fract(fx)) / 10.0, p.y);
  vec2 s = vec2(float(count) / tw / 10.0, 1.0 / h);
  return textureGrad(u_glyphs, auv, dx * s, dy * s).r;
}

// Distance in device pixels from the nearest cell edge.
float edgeDistance(vec2 uv, float pxPerCell) {
  vec2 e = min(uv, 1.0 - uv) * pxPerCell;
  return min(e.x, e.y);
}

// Coverage of a grid line "width" device pixels wide along the cell's edges.
// "shared" (-x, +x, -y, +y) is 1 where the neighbor across that edge draws its
// own half of the line: each side then draws width / 2 so the halves meet into a
// single line instead of stacking into a double-thick one. Edges without such a
// neighbor (outlines, filled neighbors) draw the full width on this side.
float gridLine(vec2 uv, vec2 pxPerCell, float width, vec4 shared) {
  vec4 d = vec4(uv.x, 1.0 - uv.x, uv.y, 1.0 - uv.y) * pxPerCell.xxyy;
  vec4 w = mix(vec4(width), vec4(width * 0.5), shared);
  vec4 cov = clamp(w - d + 0.5, 0.0, 1.0);
  return max(max(cov.x, cov.y), max(cov.z, cov.w));
}
`,T=null;function E(){if(T)return T;let e=document.createElement(`canvas`);e.width=640,e.height=96;let t=e.getContext(`2d`);t.fillStyle=`#000`,t.fillRect(0,0,e.width,e.height),t.fillStyle=`#fff`,t.textAlign=`center`,t.textBaseline=`middle`,t.font=`600 70px "Inter Variable", Inter, system-ui, sans-serif`;for(let e=0;e<10;e++)t.fillText(String(e),e*64+32,52);return T=e,e}function D(e){let t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,E()),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),t}var O=class{canvas;gl;cssWidth=1;cssHeight=1;dpr=1;insets={top:0,right:0,bottom:0,left:0};style=null;raf=0;tweens=[];resizeObserver;disposed=!1;lost=!1;constructor(e){this.canvas=e;let t=e.getContext(`webgl2`,{antialias:!0,alpha:!0,premultipliedAlpha:!0,preserveDrawingBuffer:!1,powerPreference:`default`});if(!t)throw Error(`WebGL 2 isn't available on this device or browser.`);this.gl=t,e.addEventListener(`webglcontextlost`,this.onContextLost),e.addEventListener(`webglcontextrestored`,this.onContextRestored),this.resizeObserver=new ResizeObserver(()=>this.resize()),this.resizeObserver.observe(e),this.measure()}setStyle(e){this.style=e,this.requestRender()}setInsets(e){this.insets=e,this.onResize(),this.requestRender()}requestRender=()=>{this.raf||this.disposed||this.lost||(this.raf=requestAnimationFrame(this.frame))};tween(e,t){return this.style?.reducedMotion&&(e=0),new Promise(n=>{e<=0?(t(1),this.requestRender(),n()):(this.tweens.push({start:-1,duration:e,update:t,resolve:n}),this.requestRender())})}cancelTweens(){for(let e of this.tweens)e.update(1),e.resolve();this.tweens=[]}get visible(){let{top:e,right:t,bottom:n,left:r}=this.insets;return{x:r,y:e,width:Math.max(40,this.cssWidth-r-t),height:Math.max(40,this.cssHeight-e-n)}}snapshot(){return this.draw(performance.now()),new Promise((e,t)=>{this.canvas.toBlob(n=>n?e(n):t(Error(`Snapshot failed`)),`image/png`)})}dispose(){this.disposed=!0,cancelAnimationFrame(this.raf),this.resizeObserver.disconnect(),this.canvas.removeEventListener(`webglcontextlost`,this.onContextLost),this.canvas.removeEventListener(`webglcontextrestored`,this.onContextRestored),this.cancelTweens()}frame=e=>{if(this.raf=0,this.disposed||this.lost)return;let t=[];for(let n of this.tweens){n.start<0&&(n.start=e);let r=Math.min(1,(e-n.start)/n.duration);n.update(r),r>=1?n.resolve():t.push(n)}this.tweens=t,(this.draw(e)||this.tweens.length>0)&&this.requestRender()};measure(){let e=this.canvas.getBoundingClientRect(),t=Math.min(window.devicePixelRatio||1,2.5),n=Math.max(1,Math.round(e.width*t)),r=Math.max(1,Math.round(e.height*t)),i=n!==this.canvas.width||r!==this.canvas.height||t!==this.dpr;return this.cssWidth=Math.max(1,e.width),this.cssHeight=Math.max(1,e.height),this.dpr=t,i&&(this.canvas.width=n,this.canvas.height=r),i}resize(){this.measure(),this.onResize(),this.requestRender()}onContextLost=e=>{e.preventDefault(),this.lost=!0,cancelAnimationFrame(this.raf),this.raf=0};onContextRestored=()=>{this.lost=!1,this.initGL(),this.requestRender()}};function k(e,t,n,r){let i=1/Math.tan(e/2),a=1/(n-r),o=new Float32Array(16);return o[0]=i/t,o[5]=i,o[10]=(r+n)*a,o[11]=-1,o[14]=2*r*n*a,o}function A(e,t,n){let r=e[0]-t[0],i=e[1]-t[1],a=e[2]-t[2],o=Math.hypot(r,i,a)||1;r/=o,i/=o,a/=o;let s=n[1]*a-n[2]*i,c=n[2]*r-n[0]*a,l=n[0]*i-n[1]*r;o=Math.hypot(s,c,l)||1,s/=o,c/=o,l/=o;let u=i*l-a*c,d=a*s-r*l,f=r*c-i*s,p=new Float32Array(16);return p[0]=s,p[1]=u,p[2]=r,p[4]=c,p[5]=d,p[6]=i,p[8]=l,p[9]=f,p[10]=a,p[12]=-(s*e[0]+c*e[1]+l*e[2]),p[13]=-(u*e[0]+d*e[1]+f*e[2]),p[14]=-(r*e[0]+i*e[1]+a*e[2]),p[15]=1,p}function j(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++)n[r*4+i]=e[i]*t[r*4]+e[4+i]*t[r*4+1]+e[8+i]*t[r*4+2]+e[12+i]*t[r*4+3];return n}function M(e){let[t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g]=e,_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,O=d*g-f*h,k=_*O-v*D+y*E+b*T-x*w+S*C;return k?(k=1/k,new Float32Array([(o*O-s*D+c*E)*k,(r*D-n*O-i*E)*k,(m*S-h*x+g*b)*k,(d*x-u*S-f*b)*k,(s*T-a*O-c*w)*k,(t*O-r*T+i*w)*k,(h*y-p*S-g*v)*k,(l*S-d*y+f*v)*k,(a*D-o*T+c*C)*k,(n*T-t*D-i*C)*k,(p*x-m*y+g*_)*k,(u*y-l*x-f*_)*k,(o*w-a*E-s*C)*k,(t*E-n*w+r*C)*k,(m*v-p*b-h*_)*k,(l*b-u*v+d*_)*k])):null}function N(e,t,n,r){let i=e[3]*t+e[7]*n+e[11]*r+e[15];return[(e[0]*t+e[4]*n+e[8]*r+e[12])/i,(e[1]*t+e[5]*n+e[9]*r+e[13])/i,(e[2]*t+e[6]*n+e[10]*r+e[14])/i]}var P=(e,t,n)=>e+(t-e)*n,F=(e,t,n)=>e<t?t:e>n?n:e,I=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2,L=`#version 300 es
layout(location = 0) in vec2 a_pos;
uniform vec2 u_grid;
uniform vec4 u_view;
out vec2 v_world;
void main() {
  v_world = a_pos * u_grid;
  gl_Position = vec4(v_world * u_view.xy + u_view.zw, 0.0, 1.0);
}`,R=`#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec2 v_world;
out vec4 o_color;

uniform usampler2D u_cells;
uniform sampler2D u_state;
uniform sampler2D u_palette;
uniform vec2 u_grid;
uniform float u_pxPerCell;
uniform float u_dpr;
uniform int u_selected;
uniform float u_tint;
uniform float u_numbers;
uniform float u_gridLines;
uniform float u_highlight;
uniform vec3 u_accent;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_intro;
uniform float u_complete;
uniform ivec2 u_cursor;
${w}

// Whether the cell at c draws grid lines (non-empty and not yet filled).
float drawsGrid(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_grid.x) || c.y >= int(u_grid.y)) return 0.0;
  if (texelFetch(u_cells, c, 0).r == 0u) return 0.0;
  return texelFetch(u_state, c, 0).r > 0.5 ? 0.0 : 1.0;
}

void main() {
  vec2 dx = dFdx(v_world);
  vec2 dy = dFdy(v_world);
  vec2 cell = floor(v_world);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= u_grid.x || cell.y >= u_grid.y) discard;
  ivec2 ci = ivec2(cell);
  int idx = int(texelFetch(u_cells, ci, 0).r);
  if (idx == 0) discard;
  vec2 uv = v_world - cell;
  float px = u_pxPerCell;

  float alpha = 1.0;
  if (u_intro < 1.0) {
    // Cells pop in from the center outwards.
    vec2 rel = (cell + 0.5 - u_grid * 0.5) / max(u_grid.x, u_grid.y);
    float delay = length(rel) * 1.1 + hash12(cell) * 0.12;
    float t = clamp((u_intro * 1.75 - delay) / 0.45, 0.0, 1.0);
    float s = max(easeOutBack(t), 0.001);
    uv = (uv - 0.5) / s + 0.5;
    dx /= s;
    dy /= s;
    px *= s;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
    alpha = clamp(t * 1.5, 0.0, 1.0);
  }

  bool filled = texelFetch(u_state, ci, 0).r > 0.5;
  vec3 shown = vision(texelFetch(u_palette, ivec2(idx - 1, 0), 0).rgb);
  vec3 col;

  if (filled) {
    col = shown;
  } else {
    col = mix(u_paper, shown, u_tint);
    bool selected = idx == u_selected;
    if (selected && u_highlight > 0.5) col = mix(col, u_accent, 0.32);
    if (u_gridLines > 0.5) {
      vec4 shared = vec4(
        drawsGrid(ci + ivec2(-1, 0)),
        drawsGrid(ci + ivec2(1, 0)),
        drawsGrid(ci + ivec2(0, -1)),
        drawsGrid(ci + ivec2(0, 1))
      );
      float line = gridLine(uv, vec2(px), max(1.0, u_dpr), shared);
      col = mix(col, u_ink, line * 0.2 * smoothstep(3.0, 8.0, px / u_dpr));
    }
    if (u_numbers > 0.5) {
      float vis = smoothstep(10.0, 16.0, px / u_dpr);
      if (vis > 0.0) {
        float m = numberMask(idx, uv, dx, dy);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 ink = lum < 0.42 ? vec3(1.0) : u_ink;
        col = mix(col, ink, m * vis * (selected ? 1.0 : 0.82));
      }
    }
  }

  if (ci == u_cursor) {
    float ring = 1.0 - smoothstep(2.0 * u_dpr, 3.0 * u_dpr, edgeDistance(uv, px));
    col = mix(col, u_accent, ring);
  }

  if (u_complete > 0.0 && u_complete < 1.0) {
    float pos = (cell.x + cell.y) / (u_grid.x + u_grid.y);
    float glow = exp(-pow((pos - (u_complete * 1.5 - 0.25)) * 8.0, 2.0));
    col = mix(col, vec3(1.0), glow * 0.6);
  }

  o_color = vec4(col * alpha, alpha);
}`,z=[251,250,247],B=[44,45,51],V=[28,28,32],H=[236,236,240],U=180,W=class extends O{kind=`2d`;program;u;vao;glyphs;cellsTex=null;stateTex=null;paletteTex=null;project=null;state=new Uint8Array;dirty=null;selected=0;cursor=-1;intro=1;complete=0;cx=0;cy=0;zoom=16;constructor(e){super(e),this.initGL()}get zoomLevel(){return this.zoom/this.fitZoom()}initGL(){let e=this.gl;this.program=x(e,L,R),this.u=S(e,this.program),this.vao=e.createVertexArray(),e.bindVertexArray(this.vao);let t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this.glyphs=D(e),this.project&&this.uploadProject(this.project)}setProject(e,t){let n=this.project?.width===e.width&&this.project.height===e.height;this.project=e,this.state=new Uint8Array(e.width*e.height);for(let t=0;t<this.state.length;t++)this.state[t]=e.filled[t]?255:0;this.uploadProject(e),n||this.fit(!1)}uploadProject(e){let t=this.gl;for(let e of[this.cellsTex,this.stateTex,this.paletteTex])e&&t.deleteTexture(e);this.cellsTex=C(t,e.width,e.height,e.cells,{internalFormat:t.R16UI,format:t.RED_INTEGER,type:t.UNSIGNED_SHORT}),this.stateTex=C(t,e.width,e.height,this.state,{internalFormat:t.R8,format:t.RED,type:t.UNSIGNED_BYTE});let n=new Uint8Array(e.palette.length*4);e.palette.forEach((e,t)=>{n.set([...o(e),255],t*4)}),this.paletteTex=C(t,e.palette.length,1,n,{internalFormat:t.RGBA8,format:t.RGBA,type:t.UNSIGNED_BYTE}),this.dirty=null,this.requestRender()}updateSlots(e){let t=this.project;if(t){if(e.length===0){for(let e=0;e<this.state.length;e++)this.state[e]=t.filled[e]?255:0;this.dirty={x0:0,y0:0,x1:t.width-1,y1:t.height-1}}for(let n of e){this.state[n]=t.filled[n]?255:0;let e=n%t.width,r=(n-e)/t.width,i=this.dirty;this.dirty=i?{x0:Math.min(i.x0,e),y0:Math.min(i.y0,r),x1:Math.max(i.x1,e),y1:Math.max(i.y1,r)}:{x0:e,y0:r,x1:e,y1:r}}this.requestRender()}}setSelected(e){this.selected=e,this.requestRender()}setCursor(e){this.cursor=e,this.requestRender()}pick(e,t){let n=this.project;if(!n)return-1;let[r,i]=this.screenToWorld(e,t),a=Math.floor(r),o=Math.floor(i);return a<0||o<0||a>=n.width||o>=n.height?-1:a+o*n.width}pan(e,t){this.cx-=e/this.zoom,this.cy-=t/this.zoom,this.clampCamera(),this.requestRender()}rotate(e,t){this.pan(e,t)}zoomAt(e,t,n){let[r,i]=this.screenToWorld(e,t);this.zoom=F(this.zoom*n,this.minZoom(),U),this.cx=r-(e-this.cssWidth/2)/this.zoom,this.cy=i-(t-this.cssHeight/2)/this.zoom,this.clampCamera(),this.requestRender()}zoomBy(e){let t=this.visible,n=F(this.zoom*e,this.minZoom(),U),r=this.zoom,[i,a]=this.screenToWorld(t.x+t.width/2,t.y+t.height/2);this.tween(220,e=>{let o=P(r,n,I(e));this.zoom=o,this.cx=i-(t.x+t.width/2-this.cssWidth/2)/o,this.cy=a-(t.y+t.height/2-this.cssHeight/2)/o})}fit(e=!0){let t=this.project;if(!t)return;let n=this.cameraFor(t.width/2,t.height/2,this.fitZoom());this.moveCamera(n,e?380:0)}focusSlot(e){let t=this.project;if(!t||e<0)return;let n=e%t.width+.5,r=Math.floor(e/t.width)+.5,i=Math.max(this.zoom,Math.min(36,U));this.moveCamera(this.cameraFor(n,r,i),450)}playIntro(){return this.intro=0,this.tween(1300,e=>{this.intro=e})}playCompletion(){return this.complete=0,this.fit(!0),this.tween(1800,e=>{this.complete=e>=1?0:e})}dispose(){super.dispose();let e=this.gl;for(let t of[this.cellsTex,this.stateTex,this.paletteTex,this.glyphs])t&&e.deleteTexture(t);e.deleteProgram(this.program)}onResize(){this.project&&this.clampCamera()}draw(){let e=this.gl,t=this.project,n=this.style;if(e.viewport(0,0,this.canvas.width,this.canvas.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),!t||!n||!this.cellsTex||!this.stateTex||!this.paletteTex)return!1;if(this.dirty){let{x0:n,y0:r,x1:i,y1:a}=this.dirty;e.bindTexture(e.TEXTURE_2D,this.stateTex),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.pixelStorei(e.UNPACK_ROW_LENGTH,t.width),e.pixelStorei(e.UNPACK_SKIP_PIXELS,n),e.pixelStorei(e.UNPACK_SKIP_ROWS,r),e.texSubImage2D(e.TEXTURE_2D,0,n,r,i-n+1,a-r+1,e.RED,e.UNSIGNED_BYTE,this.state),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),this.dirty=null}e.useProgram(this.program),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA);let r=this.u,i=2*this.zoom/this.cssWidth,a=-2*this.zoom/this.cssHeight;e.uniform2f(r.u_grid,t.width,t.height),e.uniform4f(r.u_view,i,a,-this.cx*i,-this.cy*a),e.uniform1f(r.u_pxPerCell,this.zoom*this.dpr),e.uniform1f(r.u_dpr,this.dpr),e.uniform1i(r.u_selected,this.selected),e.uniform1f(r.u_tint,n.tint),e.uniform1f(r.u_numbers,+!!n.showNumbers),e.uniform1f(r.u_gridLines,+!!n.showGrid),e.uniform1f(r.u_highlight,+!!n.highlightSelected),e.uniform3f(r.u_accent,n.accent[0]/255,n.accent[1]/255,n.accent[2]/255);let o=n.dark?B:z,s=n.dark?H:V;e.uniform3f(r.u_paper,o[0]/255,o[1]/255,o[2]/255),e.uniform3f(r.u_ink,s[0]/255,s[1]/255,s[2]/255),e.uniform1f(r.u_intro,this.intro),e.uniform1f(r.u_complete,this.complete);let c=this.cursor>=0?this.cursor%t.width:-1,l=this.cursor>=0?Math.floor(this.cursor/t.width):-1;return e.uniform2i(r.u_cursor,c,l),e.uniformMatrix3fv(r.u_vision,!0,n.vision),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.cellsTex),e.uniform1i(r.u_cells,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.stateTex),e.uniform1i(r.u_state,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.paletteTex),e.uniform1i(r.u_palette,2),e.activeTexture(e.TEXTURE3),e.bindTexture(e.TEXTURE_2D,this.glyphs),e.uniform1i(r.u_glyphs,3),e.bindVertexArray(this.vao),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),!1}screenToWorld(e,t){return[this.cx+(e-this.cssWidth/2)/this.zoom,this.cy+(t-this.cssHeight/2)/this.zoom]}fitZoom(){let e=this.project;if(!e)return 16;let t=this.visible,n=Math.min(48,t.width*.06);return F(Math.min((t.width-n*2)/e.width,(t.height-n*2)/e.height),.5,U)}minZoom(){return Math.min(this.fitZoom()*.5,4)}cameraFor(e,t,n){let r=this.visible;return{cx:e-(r.x+r.width/2-this.cssWidth/2)/n,cy:t-(r.y+r.height/2-this.cssHeight/2)/n,zoom:n}}moveCamera(e,t){let n={cx:this.cx,cy:this.cy,zoom:this.zoom};this.tween(t,t=>{let r=I(t);this.zoom=Math.exp(P(Math.log(n.zoom),Math.log(e.zoom),r)),this.cx=P(n.cx,e.cx,r),this.cy=P(n.cy,e.cy,r)})}clampCamera(){let e=this.project;e&&(this.cx=F(this.cx,-e.width*.25,e.width*1.25),this.cy=F(this.cy,-e.height*.25,e.height*1.25))}},G=2048,K=[[0,0,-1],[0,0,1],[1,0,0],[1,0,0],[1,0,0],[-1,0,0]],q=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]],J=40*Math.PI/180,Y=`#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in uvec4 a_a; // x, y, z, face
layout(location = 2) in uvec4 a_b; // color, slot lo, slot hi, random | shared-edge mask << 8

uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform sampler2D u_state;
uniform float u_intro;
uniform float u_height;

out vec2 v_uv;
out vec3 v_normal;
out float v_y;
flat out int v_color;
flat out int v_filled;
flat out vec4 v_shared;

const vec3 ORIGIN[6] = vec3[6](vec3(1,1,1), vec3(0,1,0), vec3(0,1,0), vec3(0,0,1), vec3(0,1,1), vec3(1,1,0));
const vec3 U[6] = vec3[6](vec3(0,0,-1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(1,0,0), vec3(-1,0,0));
const vec3 V[6] = vec3[6](vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,-1,0), vec3(0,-1,0));
const vec3 N[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));

void main() {
  int face = int(a_a.w);
  vec3 vox = vec3(a_a.xyz);
  vec3 p = vox + ORIGIN[face] + U[face] * a_corner.x + V[face] * a_corner.y;
  int slot = int(a_b.y) | (int(a_b.z) << 16);
  v_filled = texelFetch(u_state, ivec2(slot % ${G}, slot / ${G}), 0).r > 0.5 ? 1 : 0;

  if (u_intro < 1.0) {
    // Voxels drop into place, bottom layers first.
    float delay = vox.y / max(u_height, 1.0) * 0.6 + float(a_b.w & 255u) / 255.0 * 0.25;
    float t = clamp((u_intro * 1.85 - delay) / 0.5, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 center = vox + 0.5;
    p = center + (p - center) * max(t, 0.0001);
    p.y += (1.0 - e) * (u_height * 0.5 + 4.0);
  }

  uint mask = a_b.w >> 8;
  v_shared = vec4(float(mask & 1u), float((mask >> 1) & 1u), float((mask >> 2) & 1u), float((mask >> 3) & 1u));
  v_uv = a_corner;
  v_normal = N[face];
  v_color = int(a_b.x);
  v_y = vox.y;
  gl_Position = u_viewProj * vec4(p + u_offset, 1.0);
}`,X=`#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
in vec3 v_normal;
in float v_y;
flat in int v_color;
flat in int v_filled;
flat in vec4 v_shared;
out vec4 o_color;

uniform sampler2D u_palette;
uniform int u_selected;
uniform float u_tint;
uniform float u_numbers;
uniform float u_gridLines;
uniform float u_highlight;
uniform vec3 u_accent;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_complete;
uniform float u_height;
uniform float u_dpr;
uniform vec3 u_lightDir;
${w}

void main() {
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  float px = 1.0 / max(max(length(dx), length(dy)), 1e-5);
  vec3 shown = vision(texelFetch(u_palette, ivec2(v_color - 1, 0), 0).rgb);
  float diffuse = max(dot(normalize(v_normal), u_lightDir), 0.0);
  float sky = 0.5 + 0.5 * v_normal.y;
  float light = 0.62 + 0.28 * diffuse + 0.1 * sky;
  // Pixels per cell along each face axis (faces are often foreshortened).
  vec2 pxAxis = 1.0 / max(vec2(length(vec2(dx.x, dy.x)), length(vec2(dx.y, dy.y))), vec2(1e-5));
  float edge = gridLine(v_uv, pxAxis, max(1.0, u_dpr), v_shared);
  vec3 col;

  if (v_filled == 1) {
    col = shown * light;
    col = mix(col, col * 0.7, edge * 0.35);
  } else {
    col = mix(u_paper, shown, u_tint);
    bool selected = v_color == u_selected;
    if (selected && u_highlight > 0.5) col = mix(col, u_accent, 0.34);
    col *= mix(1.0, light, 0.55);
    if (u_gridLines > 0.5) col = mix(col, u_ink, edge * 0.25);
    if (u_numbers > 0.5) {
      float vis = smoothstep(12.0, 20.0, px / u_dpr);
      if (vis > 0.0) {
        float m = numberMask(v_color, v_uv, dx, dy);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 ink = lum < 0.42 ? vec3(1.0) : u_ink;
        col = mix(col, ink, m * vis * (selected ? 1.0 : 0.82));
      }
    }
  }

  if (u_complete > 0.0 && u_complete < 1.0) {
    float pos = v_y / max(u_height, 1.0);
    float glow = exp(-pow((pos - (u_complete * 1.5 - 0.25)) * 7.0, 2.0));
    col = mix(col, vec3(1.0), glow * 0.55);
  }

  o_color = vec4(col, 1.0);
}`,Z=[250,249,246],Q=[70,72,80],$=[28,28,32],ee=[240,240,244],te=class extends O{kind=`3d`;program;u;vao=null;instanceBuffer=null;quadBuffer=null;glyphs;stateTex=null;paletteTex=null;instanceCount=0;project=null;targets=null;state=new Uint8Array;stateRows=1;dirtyRows=null;selected=0;intro=1;complete=0;yaw=Math.PI/5;pitch=.5;distance=30;target=[0,0,0];viewProj=new Float32Array(16);constructor(e){super(e),this.initGL()}get zoomLevel(){return this.fitDistance()/this.distance}initGL(){let e=this.gl;this.program=x(e,Y,X),this.u=S(e,this.program),this.glyphs=D(e),this.quadBuffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.quadBuffer),e.bufferData(e.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),e.STATIC_DRAW),this.project&&this.targets&&this.upload(this.project,this.targets)}setProject(e,t){let n=this.project,r=n?.width===e.width&&n.height===e.height&&n.depth===e.depth;this.project=e,this.targets=t,this.stateRows=Math.max(1,Math.ceil(t.count/G)),this.state=new Uint8Array(G*this.stateRows);for(let n=0;n<t.count;n++)this.state[n]=e.filled[n]?255:0;this.upload(e,t),r||this.fit(!1)}upload(e,t){let n=this.gl,r=[],{width:i,height:a}=e;for(let n=0;n<t.count;n++){let o=t.voxel[n],s=o%i,c=Math.floor(o/i)%a,l=Math.floor(o/(i*a)),d=Math.imul(o,2654435761)>>>24&255,f=(t,n,r)=>t<0||n<0||r<0||t>=i||n>=a||r>=e.depth?-1:t+i*(n+a*r),p=t.face[n],m=p>=0?[p]:[0,1,2,3,4,5];for(let i of m){if(!u(e,s,c,l,i))continue;let a=0;for(let t=0;t<4;t++){let n=t%2==0?-1:1,r=t<2?K[i]:q[i],o=s+n*r[0],d=c+n*r[1],p=l+n*r[2],m=f(o,d,p);m>=0&&e.cells[m]&&u(e,o,d,p,i)&&(a|=1<<t)}r.push(s,c,l,i,t.color[n],n&65535,n>>>16,d|a<<8)}}let s=Uint16Array.from(r);this.instanceCount=s.length/8,this.vao&&n.deleteVertexArray(this.vao),this.instanceBuffer&&n.deleteBuffer(this.instanceBuffer),this.vao=n.createVertexArray(),n.bindVertexArray(this.vao),n.bindBuffer(n.ARRAY_BUFFER,this.quadBuffer),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),this.instanceBuffer=n.createBuffer(),n.bindBuffer(n.ARRAY_BUFFER,this.instanceBuffer),n.bufferData(n.ARRAY_BUFFER,s,n.STATIC_DRAW),n.enableVertexAttribArray(1),n.vertexAttribIPointer(1,4,n.UNSIGNED_SHORT,16,0),n.vertexAttribDivisor(1,1),n.enableVertexAttribArray(2),n.vertexAttribIPointer(2,4,n.UNSIGNED_SHORT,16,8),n.vertexAttribDivisor(2,1),n.bindVertexArray(null);for(let e of[this.stateTex,this.paletteTex])e&&n.deleteTexture(e);this.stateTex=C(n,G,this.stateRows,this.state,{internalFormat:n.R8,format:n.RED,type:n.UNSIGNED_BYTE});let c=new Uint8Array(e.palette.length*4);e.palette.forEach((e,t)=>c.set([...o(e),255],t*4)),this.paletteTex=C(n,e.palette.length,1,c,{internalFormat:n.RGBA8,format:n.RGBA,type:n.UNSIGNED_BYTE}),this.dirtyRows=null,this.requestRender()}updateSlots(e){let t=this.project,n=this.targets;if(t&&n){if(e.length===0){for(let e=0;e<n.count;e++)this.state[e]=t.filled[e]?255:0;this.dirtyRows={min:0,max:this.stateRows-1}}for(let n of e){this.state[n]=t.filled[n]?255:0;let e=Math.floor(n/G),r=this.dirtyRows;this.dirtyRows=r?{min:Math.min(r.min,e),max:Math.max(r.max,e)}:{min:e,max:e}}this.requestRender()}}setSelected(e){this.selected=e,this.requestRender()}setCursor(){}pick(e,n){let r=this.project,i=this.targets;if(!r||!i)return-1;let a=M(this.viewProj);if(!a)return-1;let o=e/this.cssWidth*2-1,s=1-n/this.cssHeight*2,c=N(a,o,s,-1),l=N(a,o,s,1),u=[c[0]+r.width/2,c[1]+r.height/2,c[2]+r.depth/2],d=[l[0]-c[0],l[1]-c[1],l[2]-c[2]],f=Math.hypot(...d);d[0]/=f,d[1]/=f,d[2]/=f;let p=ne(r,u,d);return p?t(i,p.voxel,p.face):-1}pan(e,t){let n=this.visible,r=2*this.distance*Math.tan(J/2)/n.height,i=[Math.cos(this.yaw),0,-Math.sin(this.yaw)],a=[-Math.sin(this.pitch)*Math.sin(this.yaw),Math.cos(this.pitch),-Math.sin(this.pitch)*Math.cos(this.yaw)];for(let n=0;n<3;n++)this.target[n]=this.target[n]-i[n]*e*r+a[n]*t*r;this.clampTarget(),this.requestRender()}rotate(e,t){this.yaw-=e*.008,this.pitch=F(this.pitch+t*.008,-1.5,1.5),this.requestRender()}zoomAt(e,t,n){this.distance=F(this.distance/n,this.minDistance(),this.fitDistance()*3),this.requestRender()}zoomBy(e){let t=this.distance,n=F(t/e,this.minDistance(),this.fitDistance()*3);this.tween(220,e=>{this.distance=P(t,n,I(e))})}fit(e=!0){this.moveCamera({target:[0,0,0],distance:this.fitDistance(),yaw:this.yaw,pitch:this.pitch},e?420:0)}focusSlot(e){let t=this.project,r=this.targets;if(!t||!r||e<0)return;let i=r.voxel[e],a=i%t.width,o=Math.floor(i/t.width)%t.height,s=Math.floor(i/(t.width*t.height)),c=r.face[e];c<0&&(c=[2,4,0,5,1,3].find(e=>u(t,a,o,s,e))??4);let l=n[c],d=l[1]===0?Math.atan2(l[0],l[2]):this.yaw,f=l[1]>0?1.1:l[1]<0?-1.1:.35,p=this.yaw;for(;d-p>Math.PI;)p+=Math.PI*2;for(;p-d>Math.PI;)p-=Math.PI*2;this.yaw=p,this.moveCamera({target:[a+.5-t.width/2,o+.5-t.height/2,s+.5-t.depth/2],distance:Math.max(this.minDistance()*1.5,Math.min(this.distance,14)),yaw:d,pitch:f},600)}playIntro(){return this.intro=0,this.tween(1600,e=>{this.intro=e})}playCompletion(){let e=this.yaw,t={target:[...this.target],distance:this.distance,pitch:this.pitch},n=this.fitDistance();return this.tween(2600,r=>{let i=I(r);this.yaw=e+i*Math.PI*2,this.pitch=P(t.pitch,.45,i),this.distance=P(t.distance,n,i);for(let e=0;e<3;e++)this.target[e]=P(t.target[e],0,i);this.complete=r>=1?0:r})}dispose(){super.dispose();let e=this.gl;for(let t of[this.stateTex,this.paletteTex,this.glyphs])t&&e.deleteTexture(t);this.vao&&e.deleteVertexArray(this.vao);for(let t of[this.instanceBuffer,this.quadBuffer])t&&e.deleteBuffer(t);e.deleteProgram(this.program)}onResize(){this.requestRender()}draw(){let e=this.gl,t=this.project,n=this.style;if(e.viewport(0,0,this.canvas.width,this.canvas.height),e.clearColor(0,0,0,0),e.clearDepth(1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),!t||!n||!this.vao||!this.stateTex||!this.paletteTex)return!1;if(this.dirtyRows){let{min:t,max:n}=this.dirtyRows;e.bindTexture(e.TEXTURE_2D,this.stateTex),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texSubImage2D(e.TEXTURE_2D,0,0,t,G,n-t+1,e.RED,e.UNSIGNED_BYTE,this.state.subarray(t*G,(n+1)*G)),this.dirtyRows=null}this.viewProj=this.computeViewProj(),e.useProgram(this.program),e.disable(e.BLEND),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL);let r=this.u;e.uniformMatrix4fv(r.u_viewProj,!1,this.viewProj),e.uniform3f(r.u_offset,-t.width/2,-t.height/2,-t.depth/2),e.uniform1f(r.u_intro,this.intro),e.uniform1f(r.u_height,t.height),e.uniform1f(r.u_dpr,this.dpr),e.uniform1i(r.u_selected,this.selected),e.uniform1f(r.u_tint,n.tint),e.uniform1f(r.u_numbers,+!!n.showNumbers),e.uniform1f(r.u_gridLines,+!!n.showGrid),e.uniform1f(r.u_highlight,+!!n.highlightSelected),e.uniform3f(r.u_accent,n.accent[0]/255,n.accent[1]/255,n.accent[2]/255);let i=n.dark?Q:Z,a=n.dark?ee:$;e.uniform3f(r.u_paper,i[0]/255,i[1]/255,i[2]/255),e.uniform3f(r.u_ink,a[0]/255,a[1]/255,a[2]/255),e.uniform1f(r.u_complete,this.complete);let o=Math.sin(this.yaw+.6),s=Math.cos(this.yaw+.6),c=Math.hypot(o,1.4,s);return e.uniform3f(r.u_lightDir,o/c,1.4/c,s/c),e.uniformMatrix3fv(r.u_vision,!0,n.vision),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.stateTex),e.uniform1i(r.u_state,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.paletteTex),e.uniform1i(r.u_palette,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.glyphs),e.uniform1i(r.u_glyphs,2),e.bindVertexArray(this.vao),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,this.instanceCount),e.bindVertexArray(null),e.disable(e.DEPTH_TEST),!1}computeViewProj(){let e=this.visible,t=this.cssWidth/this.cssHeight,n=Math.cos(this.pitch),r=[this.target[0]+this.distance*n*Math.sin(this.yaw),this.target[1]+this.distance*Math.sin(this.pitch),this.target[2]+this.distance*n*Math.cos(this.yaw)],i=this.radius(),a=Math.max(.05,this.distance-i*2),o=this.distance+i*2+10,s=k(2*Math.atan(Math.tan(J/2)*(this.cssHeight/e.height)),t,a,o),c=(e.x+e.width/2)/this.cssWidth*2-1,l=1-(e.y+e.height/2)/this.cssHeight*2;return s[8]-=c,s[9]-=l,j(s,A(r,this.target,[0,1,0]))}radius(){let e=this.project;return e?Math.hypot(e.width,e.height,e.depth)/2:10}fitDistance(){let e=this.visible,t=e.width/e.height,n=J/2,r=Math.atan(Math.tan(n)*t),i=this.radius()*1.05;return Math.max(i/Math.sin(Math.min(n,r)),4)}minDistance(){return Math.max(3,this.radius()*.2)}clampTarget(){let e=this.project;if(!e)return;let t=[e.width,e.height,e.depth];for(let e=0;e<3;e++)this.target[e]=F(this.target[e],-t[e]*.75,t[e]*.75)}moveCamera(e,t){let n={target:[...this.target],distance:this.distance,yaw:this.yaw,pitch:this.pitch};this.tween(t,t=>{let r=I(t);for(let t=0;t<3;t++)this.target[t]=P(n.target[t],e.target[t],r);this.distance=P(n.distance,e.distance,r),this.yaw=P(n.yaw,e.yaw,r),this.pitch=P(n.pitch,e.pitch,r)})}};function ne(e,t,n){let r=[e.width,e.height,e.depth],i=0,a=1/0,o=-1;for(let e=0;e<3;e++){let s=n[e],c=t[e];if(Math.abs(s)<1e-9){if(c<0||c>r[e])return null;continue}let l=(0-c)/s,u=(r[e]-c)/s;if(l>u&&([l,u]=[u,l]),l>i&&(i=l,o=e),a=Math.min(a,u),i>a)return null}let s=[0,1,2].map(e=>t[e]+n[e]*(i+1e-6)),c=s.map((e,t)=>F(Math.floor(e),0,r[t]-1)),l=n.map(e=>e>0?1:-1),u=n.map(e=>Math.abs(e)<1e-9?1/0:Math.abs(1/e)),d=[0,1,2].map(e=>{let t=n[e];if(Math.abs(t)<1e-9)return 1/0;let r=t>0?c[e]+1:c[e];return i+(r-s[e])/t}),f=o>=0?o*2+ +(l[o]>0):4,p=e.width+e.height+e.depth+3;for(let t=0;t<p;t++){let[t,n,r]=c;if(t<0||n<0||r<0||t>=e.width||n>=e.height||r>=e.depth)return null;let i=t+e.width*(n+e.height*r);if(e.cells[i])return{voxel:i,face:f};let a=0;d[1]<d[a]&&(a=1),d[2]<d[a]&&(a=2),c[a]=c[a]+l[a],d[a]=d[a]+u[a],f=a*2+ +(l[a]>0)}return null}var re=8,ie=220;function ae(e,t){let n=new Map,r=`none`,i={x:0,y:0},a={x:0,y:0},o=!1,s=0,c={dist:1,x:0,y:0},l=t=>{let n=e.getBoundingClientRect();return{x:t.clientX-n.left,y:t.clientY-n.top}},u=(e,n)=>{let r=t.view.pick(e,n);r<0||t.session.fill(r,t.getSelected())},d=(e,t)=>{let n=Math.hypot(t.x-e.x,t.y-e.y),r=Math.max(1,Math.ceil(n/3));for(let n=1;n<=r;n++)u(e.x+(t.x-e.x)*n/r,e.y+(t.y-e.y)*n/r)},f=e=>{let n=t.view.kind===`3d`;if(e.button===1||e.button===0&&e.shiftKey&&n)return`pan`;if(e.button===2||t.isSpaceHeld())return n?`orbit`:`pan`;switch(t.getTool()){case`paint`:return`paint`;case`fill`:return`fill`;case`move`:return n?`orbit`:`pan`}},p=()=>{let[e,t]=[...n.values()];c={dist:Math.max(1,Math.hypot(e.x-t.x,e.y-t.y)),x:(e.x+t.x)/2,y:(e.y+t.y)/2}},m=c=>{if(c.pointerType===`mouse`&&c.button>2)return;let d=l(c);e.setPointerCapture(c.pointerId),n.set(c.pointerId,d),n.size===2?(r===`paint`&&(performance.now()-s<ie?t.session.cancelStroke():t.session.endStroke()),r=`pinch`,p()):n.size>2||(e.focus({preventScroll:!0}),r=f(c),i=d,a=d,o=!1,r===`paint`&&(s=performance.now(),t.session.beginStroke(),u(d.x,d.y)))},h=e=>{if(!n.has(e.pointerId))return;let s=l(e);if(n.set(e.pointerId,s),r===`pinch`&&n.size>=2){let[e,r]=[...n.values()],i=Math.max(1,Math.hypot(e.x-r.x,e.y-r.y)),a=(e.x+r.x)/2,o=(e.y+r.y)/2;t.view.zoomAt(a,o,i/c.dist),t.view.pan(a-c.x,o-c.y),c={dist:i,x:a,y:o};return}!o&&Math.hypot(s.x-i.x,s.y-i.y)>re&&(o=!0,r===`fill`&&(r=t.view.kind===`3d`?`orbit`:`pan`));let u=s.x-a.x,f=s.y-a.y;r===`paint`?d(a,s):r===`pan`?t.view.pan(u,f):r===`orbit`&&t.view.rotate(u,f),a=s},g=i=>{if(!n.has(i.pointerId))return;if(n.delete(i.pointerId),e.hasPointerCapture(i.pointerId)&&e.releasePointerCapture(i.pointerId),r===`pinch`){n.size===0?r=`none`:p();return}let a=l(i);if(r===`paint`){if(!o&&i.type===`pointerup`&&t.getSmartSelect()){let e=t.view.pick(a.x,a.y),n=e>=0?t.session.colorAt(e):0;n>0&&n!==t.getSelected()&&!t.session.isFilled(e)&&(t.onSmartSelect(n),t.session.fill(e,n))}i.type===`pointercancel`?t.session.cancelStroke():t.session.endStroke()}else if(r===`fill`&&!o&&i.type===`pointerup`){let e=t.view.pick(a.x,a.y);if(e>=0){let n=t.getSelected(),r=t.session.colorAt(e);r!==n&&r>0&&t.getSmartSelect()&&!t.session.isFilled(e)&&(t.onSmartSelect(r),n=r),t.session.floodFill(e,n)}}r=`none`},_=e=>{e.preventDefault();let n=l(e),r=e.deltaMode===1?16:e.deltaMode===2?400:1,i=e.deltaX*r,a=e.deltaY*r,o=e.deltaMode!==0||i===0&&Math.abs(a)>=40&&Number.isInteger(a);e.ctrlKey||e.metaKey?t.view.zoomAt(n.x,n.y,Math.exp(-a*.01)):o?t.view.zoomAt(n.x,n.y,Math.exp(-a*.0018)):t.view.kind===`3d`?t.view.rotate(-i,-a):t.view.pan(-i,-a)},v=e=>e.preventDefault();return e.addEventListener(`pointerdown`,m),e.addEventListener(`pointermove`,h),e.addEventListener(`pointerup`,g),e.addEventListener(`pointercancel`,g),e.addEventListener(`wheel`,_,{passive:!1}),e.addEventListener(`contextmenu`,v),e.addEventListener(`gesturestart`,v),e.addEventListener(`gesturechange`,v),()=>{e.removeEventListener(`pointerdown`,m),e.removeEventListener(`pointermove`,h),e.removeEventListener(`pointerup`,g),e.removeEventListener(`pointercancel`,g),e.removeEventListener(`wheel`,_),e.removeEventListener(`contextmenu`,v),e.removeEventListener(`gesturestart`,v),e.removeEventListener(`gesturechange`,v)}}export{_ as a,f as c,b as i,te as n,v as o,W as r,m as s,ae as t};
//# sourceMappingURL=gestures-D9SZ4bWc.js.map