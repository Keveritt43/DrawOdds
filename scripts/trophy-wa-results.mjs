/** Read-only research: extract WDFW 2025 individual-hunt applicant counts; never writes the database. */
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('out/trophy-demand',{recursive:true});
for (const species of ['deer','elk']) {
  const url=`https://wdfw.wa.gov/hunting/management/game-harvest/2025/${species}-individual`;
  const response=await fetch(url);
  if(!response.ok)throw Error(`WDFW ${species}: HTTP ${response.status}`);
  const html=await response.text(), rows={}, duplicates=[];
  for(const match of html.matchAll(/<table\b[^>]*>\s*<caption>\s*(\d+)\s*-\s*([^<]+)<\/caption>([\s\S]*?)<\/table>/gi)) {
    const body=match[3];
    if (!/<th\b[^>]*>\s*Total Applicants\s*<\/th>/i.test(body)) continue;
    const cell=/<tbody\b[^>]*>[\s\S]*?<td\b[^>]*>\s*([\d,]+)\s*<\/td>/i.exec(body);
    if(!cell)continue;
    const code=match[1], applicants=Number(cell[1].replaceAll(',',''));
    if(rows[code] && rows[code].applicants!==applicants)duplicates.push(code);
    rows[code]={name:match[2].trim(),applicants};
  }
  if(Object.keys(rows).length<100 || duplicates.length)throw Error(`Incomplete or ambiguous WDFW ${species} extraction: ${Object.keys(rows).length} rows, duplicates ${duplicates.join(',')}`);
  writeFileSync(`out/trophy-demand/wa-${species}-2025-official.json`,JSON.stringify({url,year:2025,rows},null,2));
  console.log(`${species}: ${Object.keys(rows).length} unambiguous applicant counts`);
}
