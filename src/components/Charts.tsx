import { useId } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from 'recharts';

type Data = { name: string; count: number }[];
const tooltipStyle = { backgroundColor:'#19232b',border:'1px solid #334047',borderRadius:12,color:'#f2f3f0',fontSize:12,boxShadow:'0 8px 28px #0008' };
export function FilmArea({data,color='#d5ef76',height=230}:{data:Data,color?:string,height?:number}) {
 const gradientId = useId();
 if(!data.length) return <div className="chart-empty">No dated entries yet.</div>;
 return <div style={{width:'100%',height}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:10,right:8,bottom:0,left:-24}}>
  <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.27}/><stop offset="98%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
  <CartesianGrid stroke="#273238" strokeDasharray="3 7" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#829098',fontSize:11}} minTickGap={22}/>
  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#829098',fontSize:11}}/>
  <Tooltip contentStyle={tooltipStyle} cursor={{stroke:'#d5ef76',strokeDasharray:'4 4'}} />
  <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`}/>
 </AreaChart></ResponsiveContainer></div>;
}
export function FilmBars({data,height=210,highlight='#d5ef76'}:{data:Data,height?:number;highlight?:string}) {
 if(!data.length) return <div className="chart-empty">No data yet.</div>;
 return <div style={{width:'100%',height}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:8,left:-23,bottom:0}} barCategoryGap="28%">
 <CartesianGrid stroke="#273238" strokeDasharray="3 7" vertical={false}/>
 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#829098',fontSize:11}} interval={0}/>
 <YAxis allowDecimals={false} tick={{fill:'#829098',fontSize:11}} axisLine={false} tickLine={false}/>
 <Tooltip cursor={{fill:'#ffffff0a'}} contentStyle={tooltipStyle}/>
 <Bar dataKey="count" radius={[5,5,0,0]}>{data.map((_,i)=><Cell key={i} fill={i===data.length-1?highlight:i%3===0?'#97b4a8':'#546c68'}/>)}</Bar>
 </BarChart></ResponsiveContainer></div>;
}
export function VerticalBars({data}:{data:Data}) {
 const max = Math.max(...data.map(x=>x.count),1);
 return <div className="horizontal-bars">{data.map((item,i)=><div className="hbar" key={item.name}>
 <div className="hbar-top"><span><em>{String(i+1).padStart(2,'0')}</em>{item.name}</span><strong>{item.count}</strong></div>
 <div className="hbar-track"><span style={{width:`${Math.max(item.count/max*100,2)}%`}}/></div>
 </div>)}</div>;
}
