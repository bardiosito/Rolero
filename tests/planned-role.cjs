// Regression fixtures for features that assume the day's operating rooms are planned.
// Tests of omitted rooms and redistribution call the real generator directly.
const R=require('../app/src/main/assets/engine');
module.exports=(state,options)=>{
 const planned=structuredClone(state),weekday=R.weekdayIndex(options.date);
 planned.dailyOverrides=planned.dailyOverrides||{};
 for(const doctor of planned.doctors.filter(item=>item.shift===options.shift)){
  const day=planned.dailyOverrides[options.date]||{},override=day[doctor.id]||{},service=override.service||(weekday>=0?doctor.schedule[weekday]:'manual');
  if(service==='qx'&&!Object.prototype.hasOwnProperty.call(override,'room')){planned.dailyOverrides[options.date]=day;day[doctor.id]={...override,room:'QX 1'};}
 }
 return R.generate(planned,options);
};
