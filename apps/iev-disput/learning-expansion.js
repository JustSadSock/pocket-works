import { LEARNING_UNITS, UNIT_BY_ID } from './learning-data.js';
import { EXTRA_PRACTICE } from './learning-extra.js';
import { loadSourceSections } from './source-loader.js';
import { FULL_UNITS_1 } from './full-coverage-1.js';
import { FULL_UNITS_2 } from './full-coverage-2.js';
import { FULL_UNITS_3 } from './full-coverage-3.js';
import { FULL_UNITS_4 } from './full-coverage-4.js';
import { FULL_UNITS_5 } from './full-coverage-5.js';
import { FULL_UNITS_6 } from './full-coverage-6.js';
import { FULL_UNITS_7 } from './full-coverage-7.js';
import { FULL_UNITS_8 } from './full-coverage-8.js';

const fullUnits=[...FULL_UNITS_1,...FULL_UNITS_2,...FULL_UNITS_3,...FULL_UNITS_4,...FULL_UNITS_5,...FULL_UNITS_6,...FULL_UNITS_7,...FULL_UNITS_8];
const sourceSections=await loadSourceSections();
const sourceByTitle=new Map(sourceSections.map(section=>[section.title,section.paragraphs]));
const existing=new Set(LEARNING_UNITS.map(unit=>unit.id));

for(const meta of fullUnits){
  if(existing.has(meta.id)) continue;
  const paragraphs=sourceByTitle.get(meta.sourceTitle)||[];
  const sections=meta.groups.map(group=>({
    title:group.title,
    text:paragraphs.slice(group.from-1,group.to).map(text=>`• ${text}`).join('\n')
  }));
  const unit={
    id:meta.id,title:meta.title,eyebrow:meta.eyebrow,time:meta.time,
    sourceTitle:meta.sourceTitle,
    sourceRanges:meta.groups.map(group=>[group.from,group.to]),
    sections,quizIds:[],final:meta.final
  };
  LEARNING_UNITS.push(unit);
  UNIT_BY_ID[unit.id]=unit;
  EXTRA_PRACTICE[unit.id]=meta.practice;
  existing.add(unit.id);
}

globalThis.__IEV_FULL_COVERAGE__={base:14,detail:fullUnits.length,total:LEARNING_UNITS.length,sourceParagraphs:sourceSections.reduce((sum,section)=>sum+section.paragraphs.length,0)};
