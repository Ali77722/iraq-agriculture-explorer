(() => {
  'use strict';
  const content = window.IRAQ_CONTENT;
  const geo = window.IRAQ_GEOJSON;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalize = value => String(value || '').toLocaleLowerCase('ar').replace(/[\u064b-\u065f\u0670]/g, '').trim();
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const digits = value => String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
  const categoryNames = [...new Set(content.crops.map(crop => crop.category))];
  const byId = new Map(content.crops.map(crop => [crop.id, crop]));
  const govById = new Map(content.governorates.map(gov => [gov.id, gov]));
  const govByArabic = new Map(content.governorates.map(gov => [gov.ar, gov]));
  const numberFromSlider = value => Number(value);

  const initialState = {visited:[],quizBest:0,labScore:0,labDone:[],journeyDone:[],quizIndex:0,quizScore:0,quizLocked:false,sim:{crop:'rice',soil:'mixed',water:55,temp:27,salinity:18},mapCrop:'all'};
  let state = {...initialState};
  try {
    const stored = JSON.parse(localStorage.getItem('iraq-agriculture-explorer-v1') || '{}');
    state = {...state,...stored,sim:{...initialState.sim,...(stored.sim || {})}};
  } catch { /* يعمل التطبيق حتى إذا منع المتصفح التخزين المحلي. */ }
  const save = () => { try { localStorage.setItem('iraq-agriculture-explorer-v1', JSON.stringify(state)); } catch { showToast('تعذر حفظ التقدم في هذا المتصفح'); } };
  const addVisited = key => { if (!state.visited.includes(key)) { state.visited.push(key); save(); renderAchievements(); updateProgressLabel(); } };
  let toastTimer;
  function showToast(message) { const toast=$('#toast'); if (!toast) return; toast.textContent=message; toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),2300); }

  function fillSelect(select, options, firstLabel) {
    select.innerHTML = `<option value="all">${escapeHTML(firstLabel)}</option>` + options.map(item => `<option value="${escapeHTML(item.value)}">${escapeHTML(item.label)}</option>`).join('');
  }
  function initSelects() {
    fillSelect($('#crop-category'), categoryNames.map(value => ({value,label:value})), 'كل المحاصيل');
    fillSelect($('#crop-governorate'), content.governorates.map(gov => ({value:gov.id,label:gov.ar})), 'كل المحافظات');
    fillSelect($('#map-crop-select'), content.crops.map(crop => ({value:crop.id,label:crop.name})), 'كل الإشارات');
    $('#sim-crop').innerHTML = content.crops.map(crop => `<option value="${crop.id}">${escapeHTML(crop.name)} · ${escapeHTML(crop.category)}</option>`).join('');
    $('#sim-crop').value = state.sim.crop;
    $('#map-crop-select').value = state.mapCrop;
  }

  function matchingCrops() {
    const query=normalize($('#crop-search').value),category=$('#crop-category').value,season=$('#crop-season').value,gov=$('#crop-governorate').value;
    return content.crops.filter(crop => {
      const text=normalize([crop.name,crop.category,crop.description,crop.places,crop.tip].join(' '));
      return (!query || text.includes(query)) && (category==='all'||crop.category===category) && (season==='all'||crop.season===season) && (gov==='all'||crop.mapGov.includes(gov));
    });
  }
  function renderCrops() {
    const crops=matchingCrops(),grid=$('#crop-grid');
    $('#crop-results-count').textContent=`${digits(crops.length)} من ${digits(content.crops.length)} محصولاً`;
    $('#crop-empty').hidden=crops.length>0;
    grid.innerHTML=crops.map(crop=>`<article class="crop-card" tabindex="0" role="button" data-crop="${crop.id}" aria-label="تفاصيل محصول ${escapeHTML(crop.name)}" style="--crop-color:${crop.color}"><div class="crop-card-top"><span class="crop-illustration" aria-hidden="true">${crop.icon}</span><span class="crop-category">${escapeHTML(crop.category)}</span></div><h3>${escapeHTML(crop.name)}</h3><p class="crop-description">${escapeHTML(crop.description)}</p><div class="crop-card-bottom"><span class="season-chip">◷ ${crop.season==='غير محدد'?'الموسم غير محدد':escapeHTML(crop.season)}</span><span class="crop-open" aria-hidden="true">↗</span></div></article>`).join('');
  }
  function openCrop(cropId) {
    const crop=byId.get(cropId); if (!crop) return;
    const iconBg=`background:${crop.color}22`;
    const missing=/غير محدد في النص|لا يورد الفصل وصفاً محدداً|لا يحدد الفصل نوع|لا يحدد الفصل وصفاً نوعياً|لا يحدد الفصل المحافظات|لا يحدد الفصل المناطق\.?$|لا يورد الفصل رقماً|لا يورد قيماً|لا يذكر احتياجاً|لا يذكر احتياجات مائية/;
    const fields=[['الموسم الزراعي',crop.season],['الظروف المناخية',crop.climate],['التربة',crop.soil],['المياه',crop.water],['الأهمية',crop.importance],['المناطق المذكورة',crop.places]].filter(([label,value])=>value&&value!=='غير محدد'&&!missing.test(value));
    const varieties=crop.varieties?.length?`<div class="variety-list"><strong>أصناف الرز المذكورة</strong>${crop.varieties.map(item=>`<span>${escapeHTML(item)}</span>`).join('')}</div>`:'';
    const update=content.cropUpdates?.[crop.id];
    const updateHTML=update?`<section class="crop-update"><span class="source-badge">بيانات إضافية · ${escapeHTML(update.label)}</span><strong class="crop-update-value">${escapeHTML(update.value)}</strong><p>${escapeHTML(update.scope)}</p><a href="${update.url}" target="_blank" rel="noreferrer">${escapeHTML(update.source)} ↗</a></section>`:'';
    $('#dialog-content').innerHTML=`<div class="dialog-hero"><span class="dialog-icon" style="${iconBg}">${crop.icon}</span><div><span class="section-kicker">${escapeHTML(crop.category)}</span><h2 id="dialog-title">${escapeHTML(crop.name)}</h2></div></div><p class="dialog-summary">${escapeHTML(crop.description)}</p><div class="detail-grid">${fields.map(([label,value])=>`<div class="detail-cell"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong></div>`).join('')}</div>${updateHTML}${varieties}<p class="dialog-tip"><strong>ملاحظة تعليمية:</strong> ${escapeHTML(crop.tip)}</p><p class="dialog-source">${fields.length<6?'نظهر فقط التفاصيل المسندة إلى المرجع، ولا نعرض الحقول التي لم يحددها. ':''}المصدر الدراسي: ${escapeHTML(crop.source)}</p>`;
    const dialog=$('#crop-dialog'); if (typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
    addVisited('crops');
  }

  const MAP_W=520,MAP_H=700,PAD_X=42,PAD_Y=40;
  const allPositions=[];
  const mapTransform={scale:1,x:0,y:0};
  let selectedGov=null,dragStart=null;
  function allRings(feature) {
    if (feature.geometry.type==='Polygon') return feature.geometry.coordinates;
    if (feature.geometry.type==='MultiPolygon') return feature.geometry.coordinates.flat();
    return [];
  }
  function collectLonLat() { const all=[]; for (const feature of geo.features) for (const ring of allRings(feature)) all.push(...ring); return all; }
  const allPoints=collectLonLat();
  const bounds={minX:Math.min(...allPoints.map(p=>p[0])),maxX:Math.max(...allPoints.map(p=>p[0])),minY:Math.min(...allPoints.map(p=>p[1])),maxY:Math.max(...allPoints.map(p=>p[1]))};
  const project=([lon,lat])=>[PAD_X+(lon-bounds.minX)/(bounds.maxX-bounds.minX)*(MAP_W-2*PAD_X),PAD_Y+(bounds.maxY-lat)/(bounds.maxY-bounds.minY)*(MAP_H-2*PAD_Y)];
  function polygonCentroid(points) {
    let area=0,cx=0,cy=0;
    for(let i=0,j=points.length-1;i<points.length;j=i++) { const [x1,y1]=points[j],[x2,y2]=points[i],cross=x1*y2-x2*y1; area+=cross;cx+=(x1+x2)*cross;cy+=(y1+y2)*cross; }
    if(Math.abs(area)<1e-7) return points[Math.floor(points.length/2)];
    return [cx/(3*area),cy/(3*area)];
  }
  function featurePath(feature) {
    const commands=[];
    for(const ring of allRings(feature)) { ring.forEach((point,index)=>{const [x,y]=project(point);commands.push(`${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`);});commands.push('Z'); }
    return commands.join(' ');
  }
  function featureLabelPoint(feature) {
    const ring=allRings(feature).sort((a,b)=>b.length-a.length)[0];
    if(!ring?.length)return [MAP_W/2,MAP_H/2];
    const [lon,lat]=polygonCentroid(ring),point=project([lon,lat]);
    return point;
  }
  function renderMap() {
    const layer=$('#map-layer'); if(!geo?.features?.length){layer.innerHTML='<text x="260" y="350" text-anchor="middle">تعذر تحميل بيانات الحدود</text>';return;}
    const features=geo.features.map(feature=>{
      const gov=govByArabic.get(feature.properties.nameAr); if(!gov) return null;
      const pos=featureLabelPoint(feature);
      return {feature,gov,pos};
    }).filter(Boolean);
    const shapes=features.map(({feature,gov})=>`<path class="map-shape" id="map-${gov.id}" data-gov="${gov.id}" d="${featurePath(feature)}" role="button" tabindex="0" aria-label="محافظة ${escapeHTML(gov.ar)}"/>`).join('');
    const labels=features.map(({gov,pos})=>`<text class="map-label ${gov.ar.length>7?'long':''}" data-label="${gov.id}" x="${pos[0].toFixed(1)}" y="${pos[1].toFixed(1)}">${escapeHTML(gov.ar)}</text>`).join('');
    layer.innerHTML=shapes+labels;
    $$('.map-shape',layer).forEach(path=>{path.addEventListener('click',()=>selectGovernorate(path.dataset.gov));path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGovernorate(path.dataset.gov);}});});
    updateMapHighlight();
    applyMapTransform();
  }
  function updateMapHighlight() {
    const cropId=$('#map-crop-select').value,crop=byId.get(cropId);
    const production=content.governorateProduction?.[cropId],values=production?.values||{},numericValues=Object.values(values),maxValue=Math.max(1,...numericValues),minPositive=Math.min(...numericValues.filter(value=>value>0));
    const hasProduction=Boolean(production);
    $('#map-legend-label-1').textContent=hasProduction?`إنتاج ${production.year} · أغمق يعني أكثر`:'ورد اسمها مع المحصول في الكتاب';
    $('#map-legend-label-2').textContent=hasProduction?'صفر مسجل أو خارج نطاق المسح':'لا توجد إشارة محددة في النص';
    $('#map-legend-dot-1').classList.toggle('legend-production',hasProduction);
    $('#map-legend-dot-2').classList.toggle('legend-neutral',true);
    $$('.map-shape').forEach(shape=>{
      const covered=hasProduction&&Object.hasOwn(values,shape.dataset.gov),value=covered?values[shape.dataset.gov]:null;
      shape.classList.toggle('is-mentioned',!hasProduction&&Boolean(crop?.mapGov.includes(shape.dataset.gov)));
      shape.classList.toggle('is-stat',Boolean(covered&&value>0));
      shape.classList.toggle('is-stat-zero',Boolean(covered&&value===0));
      shape.classList.toggle('is-stat-missing',Boolean(hasProduction&&!covered));
      if(shape.dataset.gov===selectedGov)shape.style.fill='#cd9453';
      else if(covered&&value>0){const intensity=(Math.log(value)-Math.log(minPositive))/(Math.log(maxValue)-Math.log(minPositive)||1);shape.style.fill=`hsl(${103-35*intensity} ${24+20*intensity}% ${88-48*intensity}%)`;}
      else shape.style.fill='';
      shape.setAttribute('aria-label',`محافظة ${govById.get(shape.dataset.gov)?.ar||''}${covered?`: ${digits(value.toLocaleString('en-US'))} ${production.unit} في ${digits(production.year)}`:hasProduction?' — لا تتوفر قيمة لها في نطاق هذا التقرير':''}`);
      shape.classList.toggle('is-selected',shape.dataset.gov===selectedGov);
    });
    const selected=govById.get(selectedGov);
    if(selected){
      $('#gov-placeholder').hidden=true;$('#gov-details').hidden=false;$('#gov-index').textContent='المحافظة المحددة';$('#gov-name').textContent=selected.ar;$('#gov-english').textContent=selected.en;
      const crops=content.crops.filter(item=>item.mapGov.includes(selected.id));
      const list=$('#gov-crop-notes');
      if(cropId!=='all') {
        const exact=crop?.mapGov.includes(selected.id),region=crop?.mapApprox,covered=hasProduction&&Object.hasOwn(values,selected.id);
        if(hasProduction){
          list.innerHTML=covered?`<div class="gov-crop-item">إنتاج ${escapeHTML(crop?.name||'المحصول')} في ${digits(production.year)}: <strong>${digits(values[selected.id].toLocaleString('en-US'))} ${escapeHTML(production.unit)}</strong></div>`:`<div class="gov-crop-item muted">لا تتوفر قيمة لهذه المحافظة ضمن نطاق التقرير.</div>`;
          $('#gov-context').textContent=`${production.source}. ${production.scope}`;
        } else {
          list.innerHTML=`<div class="gov-crop-item ${exact?'':'muted'}">${exact?escapeHTML(crop.name+' — '+crop.mapNote):escapeHTML('هذا النص لا يسمّي '+selected.ar+' ضمن المواضع المحددة لـ '+(crop?.name||'هذا المحصول')+'. وهذا لا يعني عدم زراعته.')}</div>`;
          if(region&&exact) list.innerHTML+=`<div class="gov-crop-item muted">التظليل للوسط والجنوب تقريب إقليمي مبني على الوصف، وليس تصنيفاً إحصائياً للمحافظة.</div>`;
          $('#gov-context').textContent=crop?.source||'';
        }
      } else {
        list.innerHTML=crops.length?crops.slice(0,5).map(item=>`<div class="gov-crop-item">${escapeHTML(item.name)} — ${escapeHTML(item.mapNote)}</div>`).join(''):'<div class="gov-crop-item muted">لا يحدد الفصل محصولاً لمحافظة بعينها في الإشارات المسجلة.</div>';
        $('#gov-context').textContent='تظهر هنا الأسماء الجغرافية المحددة صراحة في فصل الزراعة؛ الإشارات إلى مناطق عامة لا تُحوّل إلى ترتيب إنتاج.';
      }
    }
  }
  function applyMapTransform(){const layer=$('#map-layer');if(layer)layer.setAttribute('transform',`translate(${mapTransform.x} ${mapTransform.y}) translate(${MAP_W/2} ${MAP_H/2}) scale(${mapTransform.scale}) translate(${-MAP_W/2} ${-MAP_H/2})`);}
  function zoomMap(factor){mapTransform.scale=Math.max(1,Math.min(4,mapTransform.scale*factor));applyMapTransform();}
  function selectGovernorate(id){selectedGov=id;updateMapHighlight();addVisited('map');}
  function initMap(){renderMap();$('#map-crop-select').addEventListener('change',event=>{state.mapCrop=event.target.value;save();updateMapHighlight();});$('#map-zoom-in').addEventListener('click',()=>zoomMap(1.25));$('#map-zoom-out').addEventListener('click',()=>zoomMap(.8));$('#map-reset').addEventListener('click',()=>{mapTransform.scale=1;mapTransform.x=0;mapTransform.y=0;selectedGov=null;$('#gov-placeholder').hidden=false;$('#gov-details').hidden=true;$('#gov-index').textContent='دليل الخريطة';updateMapHighlight();applyMapTransform();});
    const svg=$('#iraq-map');svg.addEventListener('wheel',event=>{event.preventDefault();zoomMap(event.deltaY<0?1.12:.89);},{passive:false});svg.addEventListener('pointerdown',event=>{if(event.target.classList.contains('map-shape'))return;dragStart={x:event.clientX,y:event.clientY,px:mapTransform.x,py:mapTransform.y};svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');});svg.addEventListener('pointermove',event=>{if(!dragStart)return;const rect=svg.getBoundingClientRect(),factor=MAP_W/rect.width;mapTransform.x=dragStart.px+(event.clientX-dragStart.x)*factor;mapTransform.y=dragStart.py+(event.clientY-dragStart.y)*factor;applyMapTransform();});const end=()=>{dragStart=null;svg.classList.remove('is-dragging');};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  }

  const waterLabel=value=>value<34?'شحيح':value<68?'متوسط':'وفير';
  const tempLabel=value=>value<18?'أبرد':value<30?'معتدلة':'أدفأ';
  const salinityLabel=value=>value<34?'منخفضة':value<68?'متوسطة':'مرتفعة';
  function simRules(crop,values){
    const reasons=[];let score=52,scored=false;
    if(crop.id==='rice'){
      scored=true;const water=values.water>=68,temp=values.temp>=29;
      score=20+(water?42:0)+(temp?28:0);
      reasons.push(water?'وفرة المياه تتفق مع وصف الرز في الفصل.':'المياه الشحيحة لا تنسجم مع حاجة الرز إلى مياه وفيرة.');
      reasons.push(temp?'درجة الحرارة في هذا النشاط تمثل أجواء دافئة، مثل الوصف النوعي في الفصل.':'اختر أجواء أدفأ لمواءمة وصف الرز بأنه محصول صيفي يحتاج حرارة مرتفعة.');
    } else if(crop.id==='wheat'){
      scored=true;const soil=values.soil==='mixed',water=values.water>=38;
      score=22+(soil?44:0)+(water?29:0);
      reasons.push(soil?'التربة المزيجية جيدة الصرف توافق ما يذكره الفصل للقمح.':'الفصل يذكر أن القمح يجود في تربة مزيجية جيدة الصرف.');
      reasons.push(water?'توفر المياه ينسجم مع الزراعة الإروائية، مع وجود مناطق مطرية أيضاً.':'راجع خيار المياه؛ يربط الفصل نجاح زراعة القمح بتوفر مصادر المياه.');
    } else if(crop.id==='sunflower'){
      scored=true;const soil=values.soil==='mixed',notSalty=values.soil!=='salty'&&values.salinity<68,temp=values.temp>=29;
      score=18+(soil?31:0)+(notSalty?25:0)+(temp?24:0);
      reasons.push(soil?'التربة المزيجية تتفق مع وصف الفصل.':'يصف الفصل التربة المزيجية الجيدة بأنها أنسب لزهرة الشمس.');
      reasons.push(notSalty?'الملوحة منخفضة في إعداد التجربة، والفصل يذكر تربة خالية من الأملاح.':'راجع الملوحة؛ يذكر الفصل أن التربة المناسبة خالية من الأملاح.');
      reasons.push(temp?'الإعداد يمثل حرارة مرتفعة بالمعنى التعليمي المبسط.':'الفصل يصفها بمحصول صيفي يحتاج حرارة مرتفعة، بلا عتبة رقمية محددة.');
    } else if(crop.id==='date-palm'){
      scored=true;const soil=values.soil==='alluvial',water=values.water>=38,temp=values.temp>=29,notSalty=values.salinity<68;
      score=16+(soil?28:0)+(water?23:0)+(temp?20:0)+(notSalty?13:0);
      reasons.push(soil?'التربة الرسوبية ترد ضمن عوامل انتشار النخيل.':'يذكر الفصل جودة التربة الرسوبية ضمن عوامل انتشار النخيل.');
      reasons.push(water?'توفر الري يتفق مع وصف النخيل قرب الأنهار.':'راجع توفر المياه؛ يربط الفصل انتشار النخيل بمياه الري.');
      reasons.push(temp?'الإعداد الدافئ ينسجم نوعياً مع وصف المناخ المشمس الجاف والحرارة المرتفعة.':'الفصل يذكر مناخاً مشمساً جافاً وحرارة مرتفعة، دون عتبة رقمية.');
    } else {
      const supported=[crop.season&&crop.season!=='غير محدد'?`يصنف المرجع ${crop.name} محصولاً ${crop.season==='شتوي'?'شتوياً':crop.season==='صيفي'?'صيفياً':'موسمياً'}.`:null,crop.importance,crop.places,crop.water,crop.soil].filter(value=>value&&!/غير محدد|لا يحدد الفصل|لا يورد الفصل|لا يذكر احتياجاً|لا يذكر احتياجات/.test(value));
      return {scored:false,score:0,reasons:[...supported.slice(0,3),'المقابض تغيّر ظروف النشاط، لكن لا نحسب توافقاً رقمياً لهذا المحصول من دون بيانات موثقة كافية.']};
    }
    return {scored,score:Math.min(100,score),reasons};
  }
  function runSimulation(){
    const crop=byId.get($('#sim-crop').value);if(!crop)return;
    const values={soil:$('#sim-soil').value,water:numberFromSlider($('#sim-water').value),temp:numberFromSlider($('#sim-temperature').value),salinity:numberFromSlider($('#sim-salinity').value)};
    state.sim={crop:crop.id,soil:values.soil,water:values.water,temp:values.temp,salinity:values.salinity};save();
    const result=simRules(crop,values);$('#sim-crop-icon').textContent=crop.icon;$('#sim-result-title').textContent=result.scored?'ماذا تقول هذه الظروف عن '+crop.name+'؟':'استكشف ما نعرفه عن '+crop.name;$('#sim-meter-fill').style.width=`${result.score}%`;
    $('#sim-fit-label').textContent=result.scored?(result.score>=75?'توافق أوضح':result.score>=48?'توافق جزئي':'تحتاج مراجعة'):'معلومات موثقة';
    $('#sim-explanation').textContent=result.scored?`مؤشر تعليمي: ${digits(result.score)}٪. يوضح فقط مدى توافق اختياراتك مع الصفات النوعية المسجلة في الفصل، ولا يمثل فرصة نجاح أو إنتاجاً.`:'لا تتوفر للمحصول هنا مدخلات موثقة تكفي لحساب مؤشر؛ لذلك يعرض النشاط حقائق المرجع بدلاً من نتيجة رقمية. هذه الحقول ليست تقديراً زراعياً.';
    $('#sim-reasons').innerHTML=result.reasons.map((reason,index)=>`<span>${digits(index+1)}</span><span>${escapeHTML(reason)}</span>`).join('');
    if(result.scored)addVisited('farm');
  }
  function updateSliderLabels(){const water=$('#sim-water').value,temp=$('#sim-temperature').value,salinity=$('#sim-salinity').value;$('#water-output').textContent=`${waterLabel(water)} · ${digits(water)}/١٠٠`;$('#temperature-output').textContent=`${tempLabel(temp)} · ${digits(temp)}°م`;$('#salinity-output').textContent=`${salinityLabel(salinity)} · ${digits(salinity)}/١٠٠`;}
  function initSimulation(){const ids=['sim-water','sim-temperature','sim-salinity'];$('#sim-soil').value=state.sim.soil;$('#sim-water').value=state.sim.water;$('#sim-temperature').value=state.sim.temp;$('#sim-salinity').value=state.sim.salinity;updateSliderLabels();ids.forEach(id=>$( '#'+id).addEventListener('input',updateSliderLabels));$('#sim-crop').addEventListener('change',()=>{state.sim.crop=$('#sim-crop').value;save();});$('#run-simulation').addEventListener('click',runSimulation);}

  let currentScenario=content.scenarios[0].id;
  function renderScenarios(){
    const scenario=content.scenarios.find(item=>item.id===currentScenario)||content.scenarios[0];
    $('#scenario-list').innerHTML=content.scenarios.map((item,index)=>`<button class="scenario-tab ${item.id===scenario.id?'is-active':''}" type="button" data-scenario="${item.id}"><span>${digits(index+1)} · ${escapeHTML(item.tag)}</span><strong>${escapeHTML(item.title)}</strong></button>`).join('');
    $('#scenario-list').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{currentScenario=button.dataset.scenario;renderScenarios();}));
    const done=state.labDone.includes(scenario.id);
    $('#scenario-card').innerHTML=`<span class="scenario-label"><i></i>${escapeHTML(scenario.tag)}</span><h3>${escapeHTML(scenario.title)}</h3><p class="scenario-prompt">${escapeHTML(scenario.prompt)}</p><div class="scenario-choices">${scenario.choices.map((choice,index)=>`<button class="scenario-choice ${done?(index===scenario.correct?'is-correct':''):''}" type="button" data-choice="${index}" ${done?'disabled':''}>${escapeHTML(choice)}</button>`).join('')}</div>${done?`<div class="scenario-feedback"><strong>إجابة الموقف</strong>${escapeHTML(scenario.feedback)}<div class="scenario-source">${escapeHTML(scenario.source)}</div></div>`:''}`;
    $('#scenario-card').querySelectorAll('.scenario-choice:not(:disabled)').forEach(button=>button.addEventListener('click',()=>answerScenario(scenario,Number(button.dataset.choice))));
    $('#lab-score').textContent=digits(state.labScore);
  }
  function answerScenario(scenario,index){
    const buttons=$$('.scenario-choice',$('#scenario-card'));buttons.forEach(button=>{button.disabled=true;const chosen=Number(button.dataset.choice);if(chosen===scenario.correct)button.classList.add('is-correct');else if(chosen===index)button.classList.add('is-wrong');});
    if(index===scenario.correct)state.labScore+=1;
    if(!state.labDone.includes(scenario.id))state.labDone.push(scenario.id);
    save();renderAchievements();$('#lab-score').textContent=digits(state.labScore);
    const feedback=document.createElement('div');feedback.className='scenario-feedback';feedback.innerHTML=`<strong>${index===scenario.correct?'صحيح، أحسنت':'فكّر في العلاقة مرة أخرى'}</strong>${escapeHTML(scenario.feedback)}<div class="scenario-source">${escapeHTML(scenario.source)}</div>`;$('#scenario-card').append(feedback);
    if(state.labDone.length>=content.scenarios.length)addVisited('lab');
  }

  function renderFacts(){
    const maxima={};content.facts.forEach(item=>maxima[item.unit]=Math.max(maxima[item.unit]||0,item.value));
    $('#facts-grid').innerHTML=content.facts.map(fact=>{const width=Math.max(8,Math.round(fact.value/maxima[fact.unit]*100));return `<article class="fact-card"><div class="fact-head"><span>${escapeHTML(fact.crop)}</span><span class="fact-year">${digits(fact.year)}</span></div><div class="fact-value">${digits(fact.value.toLocaleString('en-US'))}<small>${escapeHTML(fact.unit)}</small></div><p class="fact-note">${escapeHTML(fact.note)}</p><div class="fact-bar" aria-hidden="true"><span style="width:${width}%;background:${fact.color}"></span></div></article>`;}).join('');
    $('#current-data-groups').innerHTML=content.currentData.groups.map(group=>`<section class="current-data-group"><div class="current-group-head"><div><span class="source-badge">${escapeHTML(group.tag)}</span><h3>${escapeHTML(group.title)}</h3></div><p>${escapeHTML(group.source)}</p></div><div class="current-data-grid">${group.items.map(item=>`<article class="current-data-card"><span>${escapeHTML(item.label)}</span><strong>${digits(item.value)}<small>${escapeHTML(item.unit)}</small></strong><p>${escapeHTML(item.note)}</p></article>`).join('')}</div></section>`).join('');
  }
  function renderProblems(){ $('#problem-list').innerHTML=content.problems.map(item=>`<article class="problem-item"><span class="problem-icon" aria-hidden="true">${item.icon}</span><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p></div></article>`).join(''); }
  function renderSeasons(){ $('#season-board').innerHTML=content.seasons.map(item=>`<article class="season-card ${item.tone}"><div class="season-card-top"><span class="season-symbol" aria-hidden="true">${item.icon}</span><h3>${escapeHTML(item.title)}</h3></div><p>${escapeHTML(item.note)}</p><div class="season-crops">${item.items.map(name=>`<span>${escapeHTML(name)}</span>`).join('')}</div></article>`).join(''); }
  function renderJourney(){
    $('#journey-track').innerHTML=content.journey.map((item,index)=>{const done=state.journeyDone.includes(index);return `<button class="journey-step ${done?'is-done':''}" type="button" data-step="${index}" aria-pressed="${done}"><span>${item.icon}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.text)}</small><em>${done?'✓':digits(index+1)}</em></button>`;}).join('');
    $$('.journey-step').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.step);if(state.journeyDone.includes(i))state.journeyDone=state.journeyDone.filter(item=>item!==i);else state.journeyDone.push(i);state.journeyDone.sort();save();renderJourney();renderAchievements();}));
    $('#journey-progress').textContent=`${digits(state.journeyDone.length)} من ${digits(content.journey.length)} اكتملت`;
    if(state.journeyDone.length===content.journey.length)addVisited('journey');
  }
  function renderGlossary(query=''){
    const items=content.glossary.filter(item=>!query||normalize(item.term+' '+item.definition).includes(normalize(query)));
    $('#glossary-list').innerHTML=items.length?items.map(item=>`<details class="glossary-item"><summary>${escapeHTML(item.term)}</summary><p>${escapeHTML(item.definition)}</p></details>`).join(''):'<div class="glossary-empty">لا توجد نتيجة لهذا البحث.</div>';
  }
  let quizQuestionIndex=Math.max(0,Math.min(state.quizIndex,content.quiz.length-1));let quizScore=state.quizScore||0,quizLocked=Boolean(state.quizLocked);
  function renderQuiz(){
    const item=content.quiz[quizQuestionIndex];if(!item)return;
    $('#quiz-counter').textContent=`السؤال ${digits(quizQuestionIndex+1)} من ${digits(content.quiz.length)}`;$('#quiz-progress-fill').style.width=`${(quizQuestionIndex/content.quiz.length)*100}%`;$('#quiz-question').textContent=item.question;$('#quiz-score-live').textContent=`نتيجتك: ${digits(quizScore)}`;$('#quiz-best').textContent=digits(state.quizBest);
    $('#quiz-options').innerHTML=item.options.map((option,index)=>`<button class="quiz-option" type="button" data-answer="${index}" ${quizLocked?'disabled':''}><b>${'أ ب ج'[index]}</b><span>${escapeHTML(option)}</span></button>`).join('');
    $('#quiz-feedback').hidden=!quizLocked;$('#quiz-next').disabled=!quizLocked;$('#quiz-next').textContent=quizQuestionIndex===content.quiz.length-1?'إنهاء وإعادة الاختبار ←':'السؤال التالي ←';
    if(quizLocked){const chosen=state.quizChosen;$$('.quiz-option').forEach(button=>{const i=Number(button.dataset.answer);if(i===item.answer)button.classList.add('is-correct');else if(i===chosen)button.classList.add('is-wrong');});$('#quiz-feedback').innerHTML=`<strong>${chosen===item.answer?'إجابة صحيحة':'الإجابة الصحيحة مميزة باللون الأخضر'}</strong> — ${escapeHTML(item.why)}`;$('#quiz-progress-fill').style.width=`${((quizQuestionIndex+1)/content.quiz.length)*100}%`;}
  }
  function answerQuiz(index){if(quizLocked)return;const item=content.quiz[quizQuestionIndex];quizLocked=true;state.quizLocked=true;state.quizChosen=index;if(index===item.answer)quizScore++;state.quizScore=quizScore;state.quizBest=Math.max(state.quizBest,quizScore);save();renderQuiz();addVisited('quiz');}
  function nextQuiz(){if(!quizLocked)return;if(quizQuestionIndex===content.quiz.length-1){showToast(`اكتملت الجولة · نتيجتك ${digits(quizScore)} من ${digits(content.quiz.length)}`);quizQuestionIndex=0;quizScore=0;}else quizQuestionIndex++;quizLocked=false;state.quizIndex=quizQuestionIndex;state.quizScore=quizScore;state.quizLocked=false;delete state.quizChosen;save();renderQuiz();}
  function updateProgressLabel(){const total=content.achievements.length,done=earnedCount();$('#progress-label').textContent=done?`${digits(done)} من ${digits(total)} إنجازات`:'بداية الرحلة';}
  function earnedCount(){return content.achievements.filter(item=>isEarned(item.id)).length;}
  function isEarned(id){if(id==='map')return state.visited.includes('map');if(id==='crops')return state.visited.includes('crops');if(id==='farm')return state.visited.includes('farm');if(id==='lab')return state.labDone.length>=content.scenarios.length;if(id==='quiz')return state.visited.includes('quiz');if(id==='journey')return state.journeyDone.length===content.journey.length;return false;}
  function renderAchievements(){ $('#achievement-list').innerHTML=content.achievements.map(item=>`<div class="achievement ${isEarned(item.id)?'is-earned':''}" aria-label="${isEarned(item.id)?'مكتسب':'غير مكتسب'}: ${escapeHTML(item.title)}"><span class="achievement-icon">${item.icon}</span><strong>${escapeHTML(item.title)}</strong><small>${isEarned(item.id)?'أُنجزت':escapeHTML(item.hint)}</small></div>`).join(''); }

  function initNavigation(){
    const toggle=$('#menu-toggle'),nav=$('#primary-nav');toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
    $$('.nav-link').forEach(link=>link.addEventListener('click',()=>{toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}));
    const sections=$$('.nav-link').map(link=>$(link.getAttribute('href'))).filter(Boolean);
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){$$('.nav-link').forEach(link=>link.classList.toggle('is-active',link.hash===`#${entry.target.id}`));}});},{rootMargin:'-25% 0px -65% 0px'});sections.forEach(section=>observer.observe(section));}
    $('#progress-open').addEventListener('click',()=>{$('#learn-section').scrollIntoView({behavior:'smooth'});showToast(`أنجزت ${digits(earnedCount())} من ${digits(content.achievements.length)} إنجازات`);});
  }
  function resetProgress(){
    if(!window.confirm('إعادة ضبط تقدمك ونتائج الاختبار المحفوظة على هذا الجهاز؟'))return;
    try{localStorage.removeItem('iraq-agriculture-explorer-v1');}catch{}
    state={...initialState,visited:[],labDone:[],journeyDone:[],sim:{...initialState.sim}};quizQuestionIndex=0;quizScore=0;quizLocked=false;selectedGov=null;
    $('#gov-placeholder').hidden=false;$('#gov-details').hidden=true;$('#crop-search').value='';$('#crop-category').value='all';$('#crop-season').value='all';$('#crop-governorate').value='all';
    renderCrops();renderScenarios();renderJourney();renderQuiz();renderAchievements();updateProgressLabel();$('#sim-crop').value=state.sim.crop;$('#sim-soil').value=state.sim.soil;$('#sim-water').value=state.sim.water;$('#sim-temperature').value=state.sim.temp;$('#sim-salinity').value=state.sim.salinity;updateSliderLabels();showToast('تمت إعادة ضبط التقدم على هذا الجهاز');
  }

  function initEvents(){
    ['crop-search','crop-category','crop-season','crop-governorate'].forEach(id=>$('#'+id).addEventListener(id==='crop-search'?'input':'change',renderCrops));
    const clear=()=>{$('#crop-search').value='';$('#crop-category').value='all';$('#crop-season').value='all';$('#crop-governorate').value='all';renderCrops();};$('#clear-crop-filters').addEventListener('click',clear);$('#empty-clear').addEventListener('click',clear);
    $('#crop-grid').addEventListener('click',event=>{const card=event.target.closest('[data-crop]');if(card)openCrop(card.dataset.crop);});$('#crop-grid').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-crop]')){event.preventDefault();openCrop(event.target.dataset.crop);}});
    $('#dialog-close').addEventListener('click',()=>$('#crop-dialog').close());$('#crop-dialog').addEventListener('click',event=>{if(event.target===$('#crop-dialog'))$('#crop-dialog').close();});
    $('#glossary-search').addEventListener('input',event=>renderGlossary(event.target.value));$('#quiz-options').addEventListener('click',event=>{const button=event.target.closest('[data-answer]');if(button)answerQuiz(Number(button.dataset.answer));});$('#quiz-next').addEventListener('click',nextQuiz);$('#reset-progress').addEventListener('click',resetProgress);
    document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#crop-search').focus();}if(event.key==='Escape'&&$('#crop-dialog').open)$('#crop-dialog').close();});
  }

  function start(){
    initSelects();initNavigation();initMap();renderCrops();initSimulation();renderScenarios();renderFacts();renderProblems();renderSeasons();renderJourney();renderGlossary();renderQuiz();renderAchievements();updateProgressLabel();initEvents();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
