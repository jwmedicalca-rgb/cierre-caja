/* Exportar el cierre a Excel e imprimirlo (PDF) con membrete.
   Usa las variables y funciones de la página principal (state, recompute, allMethods, saved…). */
(function(){
  const M = Object.assign({
    nombre: "UNIFORMES CARACAS", razonSocial: "", rif: "", direccion: "", telefono: "", web: "", logo: ""
  }, (window.CIERRE_CONFIG || {}).membrete || {});

  const estadoTxt = (d, cur, sys) => cur==="cashea" ? "Por cobrar"
    : d===null || d===undefined ? (sys ? "Por contar" : "Sin ventas") : Math.abs(d)<TOL ? "Cuadra" : d<0 ? "Faltante" : "Sobrante";
  const contadoTxt = (m, r) => {
    if (m.cur==="cash") return "Ver gaveta";
    if (m.cur==="cashea") return r.fact!==null ? `Fact. ${usd(r.fact)} / Fin. ${usd(r.fin)}` : "—";
    const raw = state.conteo[m.id];
    if (raw===undefined || raw==="") return "—";
    return m.cur==="Bs" ? bs(n(raw)) : usd(n(raw));
  };
  function datos(){
    const { c, estado } = recompute();
    const filas = allMethods().map(m => ({ m, r: c.rows[m.id] }));
    const ef = c.rows.efectivo;
    return { c, estado, filas, ef, veredicto: document.querySelector("#verdict b").textContent };
  }
  const membreteLineas = () => [M.razonSocial && M.razonSocial + (M.rif ? " · RIF " + M.rif : ""), !M.razonSocial && M.rif ? "RIF " + M.rif : "", M.direccion, [M.telefono, M.web].filter(Boolean).join(" · ")].filter(Boolean);

  /* ---------- Imprimir / PDF ---------- */
  function hojaImpresion(){
    const { c, filas, ef, veredicto } = datos();
    const h = s => esc(String(s ?? ""));
    const difCls = d => d===null||d===undefined||Math.abs(d)<TOL ? "" : d<0 ? "neg" : "pos";
    const egr = state.egresos.filter(e => e.concepto || n(e.monto));
    return `
<header class="ph">
  ${M.logo ? `<img src="${h(M.logo)}" alt="" class="plogo">` : ""}
  <div class="pid"><div class="pname">${h(M.nombre)}</div>${membreteLineas().map(l=>`<div>${h(l)}</div>`).join("")}</div>
  <div class="pdoc"><div class="ptitle">Cierre de caja diario</div><div>${h(fmtFecha(state.fecha))}</div><div class="pmono">${h(state.fecha)}</div></div>
</header>
<div class="pmeta">
  <div><span>Responsable</span>${h(state.responsable || "—")}</div>
  <div><span>Tasa del día</span>${state.tasa ? h(state.tasa) + " Bs/$" : "—"}</div>
  <div><span>Pedidos POS</span>${state.pedidos || "—"}</div>
  <div><span>Origen ventas</span>${state.fuente==="shopify" ? "Shopify POS" : "Manual"}</div>
</div>
<h3>Ventas por forma de pago</h3>
<table class="pt">
  <thead><tr><th>Método</th><th>Sistema</th><th>Contado</th><th>Real</th><th>Diferencia</th><th>Estado</th></tr></thead>
  <tbody>${filas.map(({m,r})=>`<tr><td>${h(m.label)}</td><td>${usd(r.sys)}</td><td>${h(contadoTxt(m,r))}</td><td>${r.real===null||r.real===undefined?"—":usd(r.real)}</td><td class="${difCls(r.dif)}">${r.dif===null||r.dif===undefined?"—":usd(r.dif)}</td><td>${estadoTxt(r.dif, m.cur, r.sys)}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td>Total</td><td>${usd(c.ventas)}</td><td></td><td></td><td class="${difCls(c.dif)}">${usd(c.dif)}</td><td></td></tr></tfoot>
</table>
${c.rows.cashea.fact!==null ? `<p class="pnote">Cashea: facturado ${usd(c.rows.cashea.fact)}, financiado ${usd(c.rows.cashea.fin)}, inicial ${usd(c.rows.cashea.iniC)}. Por cobrar a Cashea: ${usd(c.cashea)}.</p>` : ""}
<div class="pcols">
  <div>
    <h3>Gaveta de efectivo</h3>
    <table class="pt pk">
      <tr><td>Fondo inicial</td><td>${usd(n(state.fondoUsd))}${n(state.fondoBs)?" + "+bs(n(state.fondoBs)):""}</td></tr>
      <tr><td>Ventas en efectivo</td><td>${usd(ef.sys)}</td></tr>
      <tr><td>Salidas de efectivo</td><td>${usd(c.egr)}</td></tr>
      <tr><td>Debe haber</td><td>${usd(ef.esperado)}</td></tr>
      <tr><td>Contado</td><td>${state.contUsd!==""||state.contBs!=="" ? usd(n(state.contUsd)) + (n(state.contBs)?" + "+bs(n(state.contBs)):"") : "—"}</td></tr>
      <tr><td>Diferencia</td><td class="${difCls(ef.dif)}">${ef.dif===null?"—":usd(ef.dif)}</td></tr>
    </table>
  </div>
  <div>
    <h3>Salidas de efectivo</h3>
    ${egr.length ? `<table class="pt pk">${egr.map(e=>`<tr><td>${h(e.concepto||"Sin concepto")}</td><td>${usd(n(e.monto))}</td></tr>`).join("")}</table>` : `<p class="pnote">Sin salidas registradas.</p>`}
  </div>
</div>
<div class="pres"><div><span>Resultado</span><b>${h(veredicto)}</b></div><div><span>Diferencia neta</span><b class="${difCls(c.dif)}">${usd(c.dif)}</b></div></div>
${state.notas ? `<h3>Notas</h3><p class="pnotes">${h(state.notas)}</p>` : ""}
<div class="pfirmas"><div>Entregado por</div><div>Recibido por</div></div>
<footer class="pf">Generado el ${new Date().toLocaleString("es-VE")}${M.web ? " · " + h(M.web) : ""}</footer>`;
  }
  function imprimir(){
    const s = document.getElementById("printSheet");
    s.innerHTML = hojaImpresion();
    const img = s.querySelector("img");
    const go = () => window.print();
    if (img && !img.complete){ img.onload = go; img.onerror = go; setTimeout(go, 2500); } else go();
  }

  /* ---------- Excel ---------- */
  async function logoBase64(){
    if (!M.logo) return null;
    try{
      const r = await fetch(M.logo, { mode: "cors" }); if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
    }catch{ return null; }
  }
  async function exportarExcel(){
    const msg = document.getElementById("saveMsg");
    if (!window.ExcelJS){ msg.className="msg err"; msg.textContent="No cargó la librería de Excel. Revisa tu conexión y recarga."; return; }
    const { c, filas, ef, veredicto } = datos();
    const wb = new ExcelJS.Workbook(); wb.creator = M.nombre; wb.created = new Date();
    const ws = wb.addWorksheet("Cierre " + state.fecha, { pageSetup: { paperSize: 1, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins:{left:0.5,right:0.5,top:0.6,bottom:0.6,header:0.3,footer:0.3} } });
    ws.columns = [{width:26},{width:14},{width:22},{width:14},{width:14},{width:13}];
    const money = '"$"#,##0.00;[Red]-"$"#,##0.00';
    const azul = "FF1F4FA3", gris = "FF5D6B76", linea = "FFD9E0E6";

    const logo = await logoBase64();
    if (logo){
      const id = wb.addImage({ base64: logo, extension: logo.includes("image/jpeg") ? "jpeg" : "png" });
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 70 } });
    }
    const off = logo ? "B" : "A";
    ws.getCell(off+"1").value = M.nombre; ws.getCell(off+"1").font = { bold:true, size:16 };
    membreteLineas().forEach((l,i) => { const cl = ws.getCell(off+(2+i)); cl.value = l; cl.font = { size:9, color:{argb:gris} }; });
    ws.getCell("F1").value = "CIERRE DE CAJA DIARIO"; ws.getCell("F1").font = { bold:true, size:12, color:{argb:azul} }; ws.getCell("F1").alignment = { horizontal:"right" };
    ws.getCell("F2").value = fmtFecha(state.fecha); ws.getCell("F2").alignment = { horizontal:"right" };
    ws.getRow(1).height = 22;
    let r = Math.max(6, 2 + membreteLineas().length + 1);

    const meta = [["Fecha", state.fecha], ["Responsable", state.responsable || "—"], ["Tasa del día (Bs/$)", state.tasa ? n(state.tasa) : "—"], ["Pedidos POS", state.pedidos || 0], ["Origen ventas", state.fuente==="shopify" ? "Shopify POS" : "Manual"]];
    for (const [k,v] of meta){ ws.getCell("A"+r).value = k; ws.getCell("A"+r).font = { color:{argb:gris} }; ws.getCell("B"+r).value = v; r++; }
    r++;

    const titulo = t => { ws.getCell("A"+r).value = t; ws.getCell("A"+r).font = { bold:true, size:11, color:{argb:azul} }; r++; };
    const cabecera = cols => { const row = ws.getRow(r); cols.forEach((t,i)=>{ const cl=row.getCell(i+1); cl.value=t; cl.font={bold:true,color:{argb:"FFFFFFFF"}}; cl.fill={type:"pattern",pattern:"solid",fgColor:{argb:azul}}; cl.alignment={horizontal:i?"right":"left"}; }); r++; };
    const borde = row => row.eachCell({includeEmpty:true}, cl => { cl.border = { bottom:{style:"thin",color:{argb:linea}} }; });

    titulo("Ventas por forma de pago");
    cabecera(["Método","Sistema ($)","Contado","Real ($)","Diferencia ($)","Estado"]);
    for (const {m, r:x} of filas){
      const row = ws.getRow(r);
      row.values = [m.label, x.sys, contadoTxt(m,x), x.real===null||x.real===undefined?null:x.real, x.dif===null||x.dif===undefined?null:x.dif, estadoTxt(x.dif, m.cur, x.sys)];
      [2,4,5].forEach(i=>row.getCell(i).numFmt = money); row.getCell(3).alignment = {horizontal:"right"}; row.getCell(6).alignment = {horizontal:"right"};
      if (x.dif!==null && x.dif!==undefined && Math.abs(x.dif)>=TOL && m.cur!=="cashea") row.getCell(6).font = { bold:true, color:{argb: x.dif<0 ? "FFB3261E" : "FFA2610B"} };
      borde(row); r++;
    }
    const tot = ws.getRow(r); tot.values = ["Total", c.ventas, null, null, c.dif, null]; tot.font = { bold:true }; [2,5].forEach(i=>tot.getCell(i).numFmt = money);
    tot.eachCell({includeEmpty:true}, cl=>cl.border={top:{style:"medium"}}); r += 2;

    if (c.rows.cashea.fact!==null){
      titulo("Cashea");
      for (const [k,v] of [["Facturado", c.rows.cashea.fact],["Financiado (por cobrar)", c.rows.cashea.fin],["Inicial (Cashea)", c.rows.cashea.iniC]]){
        ws.getCell("A"+r).value = k; ws.getCell("B"+r).value = v; ws.getCell("B"+r).numFmt = money; r++;
      }
      r++;
    }

    titulo("Gaveta de efectivo");
    for (const [k,v] of [["Fondo inicial ($)", n(state.fondoUsd)],["Fondo inicial (Bs)", n(state.fondoBs)],["Ventas en efectivo ($)", ef.sys],["Salidas de efectivo ($)", c.egr],["Debe haber ($)", ef.esperado],["Contado ($)", n(state.contUsd)],["Contado (Bs)", n(state.contBs)],["Diferencia ($)", ef.dif]]){
      ws.getCell("A"+r).value = k; const cl = ws.getCell("B"+r); cl.value = v===null?null:v;
      cl.numFmt = k.includes("(Bs)") ? '"Bs" #,##0.00' : money; r++;
    }
    r++;
    const egr = state.egresos.filter(e => e.concepto || n(e.monto));
    if (egr.length){
      titulo("Salidas de efectivo");
      for (const e of egr){ ws.getCell("A"+r).value = e.concepto || "Sin concepto"; ws.getCell("B"+r).value = n(e.monto); ws.getCell("B"+r).numFmt = money; r++; }
      r++;
    }
    titulo("Resultado");
    ws.getCell("A"+r).value = veredicto; ws.getCell("A"+r).font = { bold:true, size:12 }; r++;
    ws.getCell("A"+r).value = "Diferencia neta"; ws.getCell("B"+r).value = c.dif; ws.getCell("B"+r).numFmt = money; ws.getCell("B"+r).font = { bold:true }; r++;
    ws.getCell("A"+r).value = "Por cobrar a Cashea"; ws.getCell("B"+r).value = c.cashea; ws.getCell("B"+r).numFmt = money; r += 2;
    if (state.notas){ titulo("Notas"); ws.mergeCells(`A${r}:F${r+2}`); const cl = ws.getCell("A"+r); cl.value = state.notas; cl.alignment = { wrapText:true, vertical:"top" }; r += 4; }
    r += 2;
    ws.getCell("A"+r).value = "______________________"; ws.getCell("D"+r).value = "______________________";
    ws.getCell("A"+(r+1)).value = "Entregado por"; ws.getCell("D"+(r+1)).value = "Recibido por";

    const fechas = Object.keys(saved).sort();
    if (fechas.length){
      const hs = wb.addWorksheet("Historial");
      hs.columns = [{header:"Fecha",key:"f",width:12},{header:"Responsable",key:"r",width:22},{header:"Ventas POS ($)",key:"v",width:15},{header:"Cashea por cobrar ($)",key:"c",width:20},{header:"Salidas ($)",key:"e",width:12},{header:"Diferencia ($)",key:"d",width:14},{header:"Estado",key:"s",width:22}];
      hs.getRow(1).eachCell(cl=>{ cl.font={bold:true,color:{argb:"FFFFFFFF"}}; cl.fill={type:"pattern",pattern:"solid",fgColor:{argb:azul}}; });
      for (const f of fechas){ const d = saved[f]; hs.addRow({f, r:d.responsable||"", v:n(d.ventasUsd), c:n(d.casheaUsd), e:n(d.egresosUsd), d:n(d.diferenciaUsd), s:d.estado||""}); }
      ["v","c","e","d"].forEach(k=>hs.getColumn(k).numFmt = money);
      hs.views = [{state:"frozen", ySplit:1}];
    }

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a = document.createElement("a"); a.href = url; a.download = `Cierre de caja ${state.fecha}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
    msg.className = "msg ok"; msg.textContent = "Excel descargado" + (logo || !M.logo ? "." : " (sin logo: no se pudo cargar la imagen).");
  }

  document.getElementById("btnExcel").addEventListener("click", exportarExcel);
  document.getElementById("btnPdf").addEventListener("click", imprimir);
})();
