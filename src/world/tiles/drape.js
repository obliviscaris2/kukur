/** Clip convex surface polygons to the terrain's exact triangles, avoiding floating road and meadow overlays. */
export function terrainPieces(poly,cell) {
  const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]),out=[];
  const x0=Math.floor(Math.min(...xs)/cell),x1=Math.floor(Math.max(...xs)/cell),z0=Math.floor(Math.min(...zs)/cell),z1=Math.floor(Math.max(...zs)/cell);
  const clip=(points,a,b)=>{
    const result=[],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    for(let i=0;i<points.length;i++){
      const p=points[i],q=points[(i+1)%points.length],dp=side(p),dq=side(q);
      if(dp>=-1e-9)result.push(p);
      if((dp>0&&dq<0)||(dp<0&&dq>0)){const t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    return result;
  };
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
    const a=[x*cell,z*cell],b=[(x+1)*cell,z*cell],c=[(x+1)*cell,(z+1)*cell],d=[x*cell,(z+1)*cell];
    for(const triangle of [[a,b,c],[a,c,d]]){
      let points=poly;for(let i=0;i<3&&points.length;i++)points=clip(points,triangle[i],triangle[(i+1)%3]);
      if(points.length<3)continue;
      let area=0;for(let i=0;i<points.length;i++){const q=points[(i+1)%points.length];area+=points[i][0]*q[1]-q[0]*points[i][1];}
      if(Math.abs(area)>1e-7)out.push(points);
    }
  }
  return out;
}
