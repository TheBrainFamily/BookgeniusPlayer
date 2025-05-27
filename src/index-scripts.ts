document.querySelectorAll("#legacy p, #legacy span, #legacy li").forEach((el) => {
  el.innerHTML = el.innerHTML.replace(/(\s|^)([aiouwz]|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani)\s/gi, "$1$2\u00A0");
});
