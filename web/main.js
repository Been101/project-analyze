import cytoscape from "cytoscape";

async function loadData() {
  const res = await fetch("/relation.json");
  return await res.json();
}

function isComponentName(name) {
  return name && /^[A-Z]/.test(name);
}

function makeElements(relations) {
  const nodes = [];
  const edges = [];
  const fileNodeMap = new Map();
  const funcNodeMap = new Map();
  const jsxNodeMap = new Map();
  let nodeId = 0;
  let compX = 0,
    fileX = 0,
    funcX = 0;

  // 1. 文件节点
  relations.forEach((fileInfo) => {
    const fileId = `file_${nodeId++}`;
    fileNodeMap.set(fileInfo.file, fileId);
    nodes.push({
      data: {
        id: fileId,
        label: fileInfo.file.split("/").pop(),
        file: fileInfo.file,
        type: "file",
        tooltip: fileInfo.file,
      },
      position: { x: fileX * 200 + 100, y: 150 },
    });
    fileX++;
  });

  // 2. 函数和组件节点，并加包含边
  relations.forEach((fileInfo) => {
    const fileId = fileNodeMap.get(fileInfo.file);
    // 函数节点
    fileInfo.functions.forEach((fn) => {
      let label = fn.name;
      if (fn.isComponent && fn.isExportDefault) {
        label = `${fn.name}【F+C】`;
      } else if (fn.isComponent) {
        label = `${fn.name}【C】`;
      } else {
        label = `${fn.name}【F】`;
      }
      if (!fn.isComponent && !fn.name) return;
      const funcId = `func_${fileId}_${fn.name}`;
      funcNodeMap.set(`${fileInfo.file}:${fn.name}`, funcId);
      nodes.push({
        data: {
          id: funcId,
          label,
          file: fileInfo.file,
          line: fn.loc && fn.loc.start.line,
          type: fn.isComponent ? "jsx" : "function",
          tooltip: `${fileInfo.file}:${fn.loc && fn.loc.start.line}`,
        },
        position: { x: funcX * 200 + 100, y: fn.isComponent ? 0 : 300 },
      });
      if (fn.isComponent) compX++;
      else funcX++;
      // 文件节点到导出组件函数节点（如 App.jsx → App【F+C】）的 contains 边
      if (!fn.isComponent || fn.isExportDefault) {
        edges.push({
          data: { source: fileId, target: funcId, label: "contains" },
        });
      }
    });
    // 组件节点（只保留首字母大写的组件）
    fileInfo.jsxComponents.forEach((comp) => {
      if (!isComponentName(comp.name)) return;
      const jsxId = `jsx_${fileId}_${comp.name}_${
        comp.loc && comp.loc.start.line
      }`;
      jsxNodeMap.set(
        `${fileInfo.file}:jsx:${comp.name}:${comp.loc && comp.loc.start.line}`,
        jsxId
      );
      nodes.push({
        data: {
          id: jsxId,
          label: `${comp.name}【C】`,
          file: fileInfo.file,
          line: comp.loc && comp.loc.start.line,
          type: "jsx",
          tooltip: `${fileInfo.file}:${comp.loc && comp.loc.start.line}`,
        },
        position: { x: compX * 200 + 100, y: 0 },
      });
      compX++;
      // 不再添加 contains 边
    });
  });

  // 3. 函数调用边（支持跨文件，caller为source）
  relations.forEach((fileInfo) => {
    fileInfo.functionCalls.forEach((call) => {
      if (!call.caller) return;
      const sourceId = funcNodeMap.get(`${fileInfo.file}:${call.caller}`);
      let targetId = null;
      if (call.targetFile && call.targetLoc) {
        targetId = funcNodeMap.get(`${call.targetFile}:${call.name}`);
      } else {
        targetId = funcNodeMap.get(`${fileInfo.file}:${call.name}`);
      }
      if (sourceId && targetId && sourceId !== targetId) {
        edges.push({
          data: { source: sourceId, target: targetId, label: "call" },
        });
      }
    });
  });

  // 4. 组件引用边
  relations.forEach((fileInfo) => {
    fileInfo.jsxComponents.forEach((comp) => {
      if (!isComponentName(comp.name)) return;
      relations.forEach((otherFile) => {
        if (otherFile === fileInfo) return;
        const fn = otherFile.functions.find((fn) => fn.name === comp.name);
        if (fn) {
          const sourceId = jsxNodeMap.get(
            `${fileInfo.file}:jsx:${comp.name}:${
              comp.loc && comp.loc.start.line
            }`
          );
          const targetId = funcNodeMap.get(`${otherFile.file}:${fn.name}`);
          if (sourceId && targetId) {
            edges.push({
              data: { source: sourceId, target: targetId, label: "jsx" },
            });
          }
        }
      });
    });
  });

  // 5. 组件函数的JSX包含关系（jsxContains）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxContains && fileInfo.jsxContains.length > 0) {
      fileInfo.jsxContains.forEach((contain) => {
        if (!isComponentName(contain.child)) return;
        const parentId = funcNodeMap.get(`${fileInfo.file}:${contain.parent}`);
        let childId = null;
        for (const [k, v] of jsxNodeMap.entries()) {
          if (k.startsWith(`${fileInfo.file}:jsx:${contain.child}:`)) {
            childId = v;
            break;
          }
        }
        if (!childId) {
          for (const [k, v] of funcNodeMap.entries()) {
            if (k.endsWith(`:${contain.child}`)) {
              childId = v;
              break;
            }
          }
        }
        if (parentId && childId) {
          edges.push({
            data: { source: parentId, target: childId, label: "jsx-contains" },
          });
        }
      });
    }
  });

  // 6. 组件函数的JSX父子关系（jsxComponentTree）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxComponentTree && fileInfo.jsxComponentTree.length > 0) {
      fileInfo.jsxComponentTree.forEach((contain) => {
        if (!isComponentName(contain.child)) return;
        const parentId = funcNodeMap.get(`${fileInfo.file}:${contain.parent}`);
        let childId = null;
        for (const [k, v] of jsxNodeMap.entries()) {
          if (k.startsWith(`${fileInfo.file}:jsx:${contain.child}:`)) {
            childId = v;
            break;
          }
        }
        if (!childId) {
          for (const [k, v] of funcNodeMap.entries()) {
            if (k.endsWith(`:${contain.child}`)) {
              childId = v;
              break;
            }
          }
        }
        if (parentId && childId) {
          edges.push({
            data: { source: parentId, target: childId, label: "jsx-parent" },
          });
        }
      });
    }
  });

  return { nodes, edges };
}

function openInCursor(file, line) {
  // cursor://file/{full path}:{line}
  const url = `cursor://file/${file}:${line || 1}`;
  window.open(url);
}

async function main() {
  const data = await loadData();
  const { nodes, edges } = makeElements(data.relations);
  const cy = (window.cy = cytoscape({
    container: document.getElementById("app"),
    elements: [...nodes, ...edges],
    layout: { name: "cose", animate: true },
    style: [
      {
        selector: "node[type='file']",
        style: {
          label: "data(label)",
          "background-color": "#222",
          color: "#fff",
          shape: "rectangle",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": 120,
          width: "label",
          height: 40,
          padding: "6px",
          "font-size": 16,
        },
      },
      {
        selector: "node[type='function']",
        style: {
          label: "data(label)",
          "background-color": "#0074D9",
          color: "#fff",
          shape: "ellipse",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": 80,
          width: "label",
          height: 40,
          padding: "4px",
          "font-size": 14,
        },
      },
      {
        selector: "node[type='jsx']",
        style: {
          label: "data(label)",
          "background-color": "#2ECC40",
          color: "#fff",
          shape: "diamond",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": 80,
          width: "label",
          height: 40,
          padding: "4px",
          "font-size": 14,
        },
      },
      {
        selector: "edge[label='contains']",
        style: {
          width: 2,
          "line-color": "#bbb",
          "target-arrow-color": "#bbb",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "",
        },
      },
      {
        selector: "edge[label='call']",
        style: {
          width: 2,
          "line-color": "#FF851B",
          "target-arrow-color": "#FF851B",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "call",
        },
      },
      {
        selector: "edge[label='jsx']",
        style: {
          width: 2,
          "line-color": "#B10DC9",
          "target-arrow-color": "#B10DC9",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "jsx",
        },
      },
      {
        selector: "edge[label='jsx-contains']",
        style: {
          width: 2,
          "line-color": "#00BFAE",
          "target-arrow-color": "#00BFAE",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "jsx-contains",
        },
      },
      {
        selector: "edge[label='jsx-parent']",
        style: {
          width: 2,
          "line-color": "#00BFAE",
          "target-arrow-color": "#00BFAE",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "jsx-parent",
        },
      },
    ],
  }));

  // 鼠标悬停显示 tooltip
  cy.on("mouseover", "node", function (evt) {
    const node = evt.target;
    node.qtip && node.qtip.destroy();
    const tooltip = node.data("tooltip");
    if (tooltip) {
      node.qtip = window.qTip({
        target: node.popperRef(),
        content: tooltip,
        placement: "top",
        show: true,
        hide: false,
      });
    }
  });
  cy.on("mouseout", "node", function (evt) {
    const node = evt.target;
    if (node.qtip) {
      node.qtip.destroy();
      node.qtip = null;
    }
  });

  cy.on("tap", "node", function (evt) {
    const node = evt.target;
    const file = node.data("file");
    const line = node.data("line");
    if (file) {
      openInCursor(file, line);
    }
  });
}

main();
