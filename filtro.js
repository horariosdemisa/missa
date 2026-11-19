// Filtro de groserías (la base de datos aplica el mismo filtro; esto solo avisa antes de enviar)
window.textoLimpio = function (t) {
  const PREFIJOS = /^(pendej|chingad|chingar|chingon|chingue|verg|cabron|culer|mierd|mamad|mamon|maric|pinche|pinchi|estupid|imbecil|ojete|huevon|guey|wey|cagad|caga|joder|jodid|prostitu|fuck|shit|bitch)/;
  const PALABRAS = new Set(["puta","puto","putas","putos","putita","joto","jotos","culo","culos","zorra","perra","naco","nacos","idiota","idiotas","pene","coño","pito","teta","tetas","nalga","nalgas","sexo","porno","xxx","kk","alv","ptm","hdp","mrd"]);
  const mapa = { á:"a", é:"e", í:"i", ó:"o", ú:"u", ü:"u", à:"a", è:"e", ì:"i", ò:"o", ù:"u", "0":"o", "1":"i", "3":"e", "4":"a", "@":"a", "$":"s" };
  const s = String(t || "").toLowerCase().replace(/[áéíóúüàèìòù0134@$]/g, c => mapa[c]);
  return !s.split(/[^a-zñ]+/).some(w => w && (PREFIJOS.test(w) || PALABRAS.has(w)));
};
