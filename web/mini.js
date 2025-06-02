import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
cytoscape.use(dagre);

async function loadData() {
  try {
    const res = await fetch("/miniprogram-relation.json");
    if (!res.ok) throw new Error("数据加载失败: " + res.status);
    return await res.json();
  } catch (e) {
    alert("加载数据失败: " + e.message);
    throw e;
  }
}

function isComponentName(name) {
  return name && /^[A-Z]/.test(name);
}

function makeElements(relations) {
  const nodes = [];
  const edges = [];
  const fileNodeMap = new Map();
  const funcNodeMap = new Map();
  let nodeId = 0;
  let fileX = 0;

  // 文件节点
  relations.forEach((fileInfo) => {
    const fileId = `file_${nodeId++}`;
    console.log("fileInfo.file", fileInfo.file);
    fileNodeMap.set(fileInfo.file, fileId);
    nodes.push({
      data: {
        id: fileId,
        label: fileInfo.file.split("/").slice(-2).join("/"),
        file: fileInfo.file,
        type: "file",
      },
      position: { x: fileX * 200 + 100, y: 150 },
    });
    fileX++;
  });

  // 方法/组件节点
  relations.forEach((fileInfo) => {
    const fileId = fileNodeMap.get(fileInfo.file);
    fileInfo.functions.forEach((fn) => {
      let label = fn.name;
      let funcId = `func_${fileId}_${fn.name}`;
      // 合并 behavior 方法节点，并统一用【B】标识
      if ((fn.fromBehavior && fn.behaviorFile) || fileInfo.isBehavior) {
        // 1. 如果是 behavior 混入方法，或当前文件本身是 behavior
        // 2. 节点 id 统一用 behavior 文件的 fileId
        let behaviorFile = fn.behaviorFile || fileInfo.file;
        const behaviorNode = relations.find((r) => r.file === behaviorFile);
        let behaviorFunc = null;
        if (behaviorNode) {
          const behaviorFileId = fileNodeMap.get(behaviorNode.file);
          funcId = `func_${behaviorFileId}_${fn.name}`;
          // 查找 behavior 文件中真正的函数定义
          behaviorFunc = behaviorNode.functions.find((f) => f.name === fn.name);
        }
        label = `${fn.name}【B】`;
        nodes.push({
          data: {
            id: funcId,
            label,
            file: behaviorNode ? behaviorNode.file : fileInfo.file,
            line:
              behaviorFunc &&
              behaviorFunc.loc &&
              behaviorFunc.loc.start &&
              behaviorFunc.loc.start.line,
            type: fn.isMiniProgramComponent ? "jsx" : "function",
          },
        });
      } else if (fn.isMiniProgramComponent) {
        const dirs = fileInfo.file.split("/");
        const compName = dirs[dirs.length - 2];
        label = compName + "【C】";
      } else {
        label = `${fn.name}【F】`;
      }
      if (!fn.name) return;
      funcNodeMap.set(`${fileInfo.file}:${fn.name}`, funcId);
      if (!((fn.fromBehavior && fn.behaviorFile) || fileInfo.isBehavior)) {
        nodes.push({
          data: {
            id: funcId,
            label,
            file: fileInfo.file,
            line: fn.loc && fn.loc.start && fn.loc.start.line,
            type: fn.isMiniProgramComponent ? "jsx" : "function",
          },
        });
      }
      edges.push({
        data: { source: fileId, target: funcId, label: "contains" },
      });
    });
  });

  // 组件引用边（usingComponents）
  relations.forEach((fileInfo) => {
    if (fileInfo.usingComponents && fileInfo.usingComponents.length > 0) {
      fileInfo.usingComponents.forEach((comp) => {
        let sourceId = null;
        if (fileInfo.functions.some((f) => f.isMiniProgramPage)) {
          sourceId = funcNodeMap.get(`${fileInfo.file}:Page`);
        } else if (fileInfo.functions.some((f) => f.isMiniProgramComponent)) {
          sourceId = funcNodeMap.get(`${fileInfo.file}:Component`);
        }
        let targetId = null;
        relations.forEach((otherFile) => {
          if (otherFile.file === fileInfo.file) return;
          const compNode = otherFile.functions.find(
            (f) => f.isMiniProgramComponent
          );
          if (compNode && otherFile.file === comp.path) {
            targetId = funcNodeMap.get(`${otherFile.file}:Component`);
          }
        });
        // 调试输出
        if (!targetId) {
          console.log("未找到组件目标节点:", comp, fileInfo.file);
        }
        if (sourceId && targetId) {
          edges.push({
            data: {
              source: sourceId,
              target: targetId,
              label: "usingComponents",
            },
          });
        }
      });
    }
  });

  // 事件绑定边（优化：Page[F] → 元素/组件 → 方法）
  relations.forEach((fileInfo) => {
    if (fileInfo.jsxEventCalls && fileInfo.jsxEventCalls.length > 0) {
      fileInfo.jsxEventCalls.forEach((eventCall) => {
        let pageId = null;
        if (fileInfo.functions.some((f) => f.isMiniProgramPage)) {
          pageId = funcNodeMap.get(`${fileInfo.file}:Page`);
        }
        // 1. 生成元素/组件节点
        let compType = "element";
        // 简单判断：首字母大写为组件，否则为原生元素
        if (eventCall.component && /^[A-Z]/.test(eventCall.component)) {
          compType = "component";
        }
        const compLabel = eventCall.component || "元素";
        console.log("compLabel", compLabel);
        const compNodeId = `eventcomp_${fileInfo.file}_${compLabel}`;
        const compLoc = eventCall.loc || null;
        console.log(
          "!nodes.some((n) => n.data.id === compNodeId)",
          !nodes.some((n) => n.data.id === compNodeId)
        );
        if (!nodes.some((n) => n.data.id === compNodeId)) {
          nodes.push({
            data: {
              id: compNodeId,
              label: compLabel,
              file: fileInfo.file,
              type: compType,
              loc: compLoc,
            },
          });
        }
        // 2. Page[F] → 元素/组件节点
        console.log("pageId", pageId);
        if (pageId) {
          edges.push({
            data: {
              source: pageId,
              target: compNodeId,
              label: "contains",
            },
          });
        }
        // 3. 元素/组件节点 → 事件处理方法节点
        let targetId = funcNodeMap.get(`${fileInfo.file}:${eventCall.target}`);
        if (compNodeId && targetId) {
          edges.push({
            data: {
              source: compNodeId,
              target: targetId,
              label: eventCall.event,
            },
          });
        }
      });
    }
  });

  // 生成 behaviors 节点
  relations.forEach((fileInfo) => {
    if (fileInfo.behaviors && fileInfo.behaviors.length > 0) {
      fileInfo.behaviors.forEach((bh) => {
        const bhId = `behavior_${fileInfo.file}_${bh.name}`;
        if (!nodes.some((n) => n.data.id === bhId)) {
          // 直接用 bh.importSource 或 fileInfo.file，不做 require/path 处理
          nodes.push({
            data: {
              id: bhId,
              label: bh.name,
              file: bh.importSource || fileInfo.file,
              type: "behavior",
            },
          });
        }
      });
    }
  });

  // behaviors/behavior.js → dataBehavior → getData【B】链路
  relations.forEach((fileInfo) => {
    if (fileInfo.isBehavior) {
      const fileId = fileNodeMap.get(fileInfo.file);
      const dataBehaviorNode = nodes.find(
        (n) => n.data.type === "behavior" && n.data.file === fileInfo.file
      );
      if (fileId && dataBehaviorNode) {
        edges.push({
          data: {
            source: fileId,
            target: dataBehaviorNode.data.id,
            label: "export",
          },
        });
      }
      fileInfo.functions.forEach((fn) => {
        if (fn.name && (fn.fromBehavior || fileInfo.isBehavior)) {
          const funcId = nodes.find(
            (n) =>
              n.data.label === `${fn.name}【B】` &&
              n.data.file === fileInfo.file
          )?.data.id;
          if (dataBehaviorNode && funcId) {
            edges.push({
              data: {
                source: dataBehaviorNode.data.id,
                target: funcId,
                label: "method",
              },
            });
          }
        }
      });
    }
  });

  // 方法调用边（支持 behavior 方法调用）
  relations.forEach((fileInfo) => {
    if (fileInfo.functionCalls && fileInfo.functionCalls.length > 0) {
      fileInfo.functionCalls.forEach((call) => {
        if (!call.caller) return;
        const sourceId = funcNodeMap.get(`${fileInfo.file}:${call.caller}`);
        let targetId = null;
        if (call.targetFile && call.targetLoc) {
          // 指向 behavior.js 的方法节点
          const behaviorFileId = fileNodeMap.get(call.targetFile);
          targetId = `func_${behaviorFileId}_${call.name}`;
        } else {
          targetId = funcNodeMap.get(`${fileInfo.file}:${call.name}`);
        }
        if (sourceId && targetId && sourceId !== targetId) {
          edges.push({
            data: { source: sourceId, target: targetId, label: "call" },
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

const style = [
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
    selector: "node[type='element']",
    style: {
      label: "data(label)",
      "background-color": "#2ECC40",
      color: "#fff",
      shape: "diamond",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 14,
      width: 40,
      height: 40,
      padding: "4px",
    },
  },
  {
    selector: "node[type='component']",
    style: {
      label: "data(label)",
      "background-color": "#2ECC40",
      color: "#fff",
      shape: "diamond",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 14,
      width: 40,
      height: 40,
      padding: "4px",
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
    selector: "edge[label='usingComponents']",
    style: {
      width: 2,
      "line-color": "#00BFFF",
      "target-arrow-color": "#00BFFF",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "usingComponents",
    },
  },
  {
    selector: "edge[label^='bind']",
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
    selector: "node[type='behavior']",
    style: {
      label: "data(label)",
      "background-color": "#888",
      color: "#fff",
      shape: "ellipse",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 14,
      width: "label",
      height: 36,
      padding: "4px",
    },
  },
  {
    selector: "edge[label='behavior']",
    style: {
      width: 2,
      "line-color": "#666",
      "target-arrow-color": "#666",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "behavior",
    },
  },
  {
    selector: "edge[label='behavior-method']",
    style: {
      width: 2,
      "line-color": "#B8860B",
      "target-arrow-color": "#B8860B",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "behavior-method",
    },
  },
  {
    selector: "edge[label='call']",
    style: {
      width: 2,
      "line-color": "#B8860B",
      "target-arrow-color": "#B8860B",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "call",
    },
  },
  {
    selector: "edge[label='button'], edge[label='view'], edge[label='image']",
    style: {
      width: 2,
      "line-color": "#888",
      "target-arrow-color": "#888",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 12,
      color: "#333",
      "text-background-color": "#fff",
      "text-background-opacity": 1,
      "text-background-shape": "roundrectangle",
      "text-border-color": "#888",
      "text-border-width": 1,
      "text-border-opacity": 1,
    },
  },
];

async function main() {
  try {
    const data = await loadData();
    const { nodes, edges } = makeElements(data.relations);
    const cy = cytoscape({
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
      style,
    });
    cy.ready(() => {
      cy.fit();
    });
    // 节点点击跳转
    cy.on("tap", "node", function (evt) {
      const node = evt.target;
      // 优先支持元素/组件节点的 loc 跳转
      const loc = node.data("loc");
      if (loc && loc.file) {
        const url = `cursor://file/${loc.file}:${loc.line || 1}`;
        window.open(url);
        return;
      }
      const file = node.data("file");
      const line = node.data("line");
      if (file) {
        const url = `cursor://file/${file}:${line || 1}`;
        window.open(url);
      }
    });
  } catch (e) {
    alert("渲染失败: " + e.message);
    console.error(e);
  }
}

window.onload = () => {
  let container = document.getElementById("app");
  if (!container) {
    container = document.createElement("div");
    container.id = "app";
    container.style.width = "100vw";
    container.style.height = "90vh";
    container.style.background = "#f8f8f8";
    document.body.appendChild(container);
  }
  main();
};
