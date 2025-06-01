import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
cytoscape.use(dagre);

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
    // 函数节点（包括组件函数）
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
      });
      if (!fn.isComponent || fn.isExportDefault) {
        edges.push({
          data: { source: fileId, target: funcId, label: "contains" },
        });
      }
    });
    // 只为有事件绑定的原生标签生成节点
    if (fileInfo.jsxEventCalls && fileInfo.jsxEventCalls.length > 0) {
      fileInfo.jsxEventCalls.forEach((eventCall) => {
        if (isComponentName(eventCall.component)) return; // 跳过组件
        const nativeId = `native_${fileId}_${eventCall.component}_${
          eventCall.loc && eventCall.loc.start.line
        }`;
        if (!nodes.some((n) => n.data.id === nativeId)) {
          nodes.push({
            data: {
              id: nativeId,
              label: `${eventCall.component}`,
              file: fileInfo.file,
              line: eventCall.loc && eventCall.loc.start.line,
              type: "native",
              tooltip: `${fileInfo.file}:${
                eventCall.loc && eventCall.loc.start.line
              }`,
            },
          });
        }
      });
    }
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

  // 4. 组件引用边（jsx边直接连到组件函数节点）
  relations.forEach((fileInfo) => {
    fileInfo.jsxComponents.forEach((comp) => {
      if (!isComponentName(comp.name)) return;
      relations.forEach((otherFile) => {
        if (otherFile === fileInfo) return;
        const fn = otherFile.functions.find((fn) => fn.name === comp.name);
        if (fn) {
          const sourceId = funcNodeMap.get(
            `${fileInfo.file}:${
              fileInfo.functions.find((f) => f.isComponent && f.isExportDefault)
                ?.name
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

  // 5. 组件函数的JSX包含关系（jsxContains，直接连到组件函数节点）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxContains && fileInfo.jsxContains.length > 0) {
      fileInfo.jsxContains.forEach((contain) => {
        if (!isComponentName(contain.child)) return;
        const parentId = funcNodeMap.get(`${fileInfo.file}:${contain.parent}`);
        let childId = null;
        for (const [k, v] of funcNodeMap.entries()) {
          if (k.endsWith(`:${contain.child}`)) {
            childId = v;
            break;
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

  // 6. 组件函数的JSX父子关系（jsxComponentTree，支持 native 节点）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxComponentTree && fileInfo.jsxComponentTree.length > 0) {
      fileInfo.jsxComponentTree.forEach((contain) => {
        const parentId = funcNodeMap.get(`${fileInfo.file}:${contain.parent}`);
        // 只查组件函数节点和有事件的原生标签节点
        let childId = funcNodeMap.get(`${fileInfo.file}:${contain.child}`);
        if (!childId) {
          childId = `native_${fileNodeMap.get(fileInfo.file)}_${
            contain.child
          }_${contain.loc && contain.loc.start.line}`;
          if (!nodes.some((n) => n.data.id === childId)) childId = null;
        }
        if (parentId && childId) {
          edges.push({
            data: { source: parentId, target: childId, label: "jsx-parent" },
          });
        }
      });
    }
  });

  // 7. 事件绑定边（jsxEventCalls）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxEventCalls && fileInfo.jsxEventCalls.length > 0) {
      fileInfo.jsxEventCalls.forEach((eventCall) => {
        // 只处理组件名和目标函数都存在的情况
        let sourceId = null;
        if (isComponentName(eventCall.component)) {
          sourceId = funcNodeMap.get(`${fileInfo.file}:${eventCall.component}`);
        } else {
          sourceId = `native_${fileNodeMap.get(fileInfo.file)}_${
            eventCall.component
          }_${eventCall.loc && eventCall.loc.start.line}`;
        }
        // 目标函数可能在本文件或其他文件
        let targetId = null;
        for (const [k, v] of funcNodeMap.entries()) {
          if (k.endsWith(`:${eventCall.target}`)) {
            targetId = v;
            break;
          }
        }
        if (sourceId && targetId) {
          edges.push({
            data: {
              source: sourceId,
              target: targetId,
              label: eventCall.event,
            },
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
    layout: {
      name: "dagre",
      rankDir: "TB",
      nodeSep: 120,
      edgeSep: 60,
      rankSep: 180,
      animate: true,
    },
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
        selector: "node[type='native']",
        style: {
          label: "data(label)",
          "background-color": "#888",
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
      {
        selector: "edge[label='onClick']",
        style: {
          width: 2,
          "line-color": "#FFDC00",
          "target-arrow-color": "#FFDC00",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
        },
      },
      {
        selector: "edge[label='onChange']",
        style: {
          width: 2,
          "line-color": "#FFDC00",
          "target-arrow-color": "#FFDC00",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
        },
      },
      {
        selector: "edge[label='onInput']",
        style: {
          width: 2,
          "line-color": "#FFDC00",
          "target-arrow-color": "#FFDC00",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
        },
      },
      {
        selector: "edge[label='onSubmit']",
        style: {
          width: 2,
          "line-color": "#FFDC00",
          "target-arrow-color": "#FFDC00",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
        },
      },
    ],
  }));

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
