// draws one of the story's places off the main thread; the page finishes it (blur, bloom) and caches it
importScripts("hd2d.js");
onmessage = e => {
  const { name, w, h } = e.data, S = self.XIB_HD.STORY[name](), r = self.XIB_HD.renderSync(S, w, h);
  postMessage({ col: r.col, dep: r.dep, P: { dof: S.dof, bloom: S.bloom, grade: S.grade } }, [r.col.buffer, r.dep.buffer]);
};
