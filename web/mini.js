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

  // === 先生成所有 ts/tsx 文件节点 ===
  relations.forEach((fileInfo) => {
    if (!fileInfo.file.endsWith('.ts') && !fileInfo.file.endsWith('.tsx')) return;
    const fileId = `file_${nodeId++}`;
    fileNodeMap.set(fileInfo.file, fileId);
    nodes.push({
      data: {
        id: fileId,
        label: fileInfo.file.split("/").slice(-2).join("/"),
        file: fileInfo.file,
        type: "file",
      },
      position: { x: fileX * 200 + 100, y: 0 },
    });
    fileX++;
  });

  // === 递归处理所有组件依赖 ===
  const componentFileNodeMap = new Map();
  const edgeSet = new Set();
  function addComponentEdges(fileInfo, visited = new Set()) {
    if (!fileInfo.file.endsWith('.ts') && !fileInfo.file.endsWith('.tsx')) return;
    if (visited.has(fileInfo.file)) return;
    visited.add(fileInfo.file);

    if (fileInfo.usingComponents && fileInfo.usingComponents.length > 0) {
      fileInfo.usingComponents.forEach((comp) => {
        const targetFileInfo = relations.find(r => r.file === comp.path);
        let compFileId;
        if (targetFileInfo) {
          compFileId = fileNodeMap.get(comp.path);
        } else {
          if (!componentFileNodeMap.has(comp.path)) {
            compFileId = `compfile_${comp.path}`;
            componentFileNodeMap.set(comp.path, compFileId);
            nodes.push({
              data: {
                id: compFileId,
                label: comp.name,
                file: comp.path,
                type: "componentFile",
              },
              position: { x: 0, y: 100 },
            });
          } else {
            compFileId = componentFileNodeMap.get(comp.path);
          }
        }
        const fileId = fileNodeMap.get(fileInfo.file);
        if (fileId && compFileId) {
          const edgeKey = `${fileId}->${compFileId}`;
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              data: {
                source: fileId,
                target: compFileId,
                label: "usingComponent",
              },
            });
            edgeSet.add(edgeKey);
          }
        }
        // 递归处理子组件，传递新的 visited Set
        if (targetFileInfo) {
          addComponentEdges(targetFileInfo, new Set(visited));
        }
      });
    }
  }
  relations.forEach((fileInfo) => {
    addComponentEdges(fileInfo);
  });
  // === 递归处理结束 ===

  // 方法/组件节点（只生成 ts/tsx 文件节点的方法/组件节点）
  relations.forEach((fileInfo) => {
    if (!fileInfo.file.endsWith('.ts') && !fileInfo.file.endsWith('.tsx')) return;
    const fileId = fileNodeMap.get(fileInfo.file);
    fileInfo.functions.forEach((fn) => {
      let label = fn.name;
      let funcId = `func_${fileId}_${fn.name}`;
      let y = 600; // 默认方法/事件节点在最底层
      // 合并 behavior 方法节点，并统一用【B】标识
      if ((fn.fromBehavior && fn.behaviorFile) || fileInfo.isBehavior) {
        let behaviorFile = fn.behaviorFile || fileInfo.file;
        const behaviorNode = relations.find((r) => r.file === behaviorFile);
        let behaviorFunc = null;
        if (behaviorNode) {
          const behaviorFileId = fileNodeMap.get(behaviorNode.file);
          funcId = `func_${behaviorFileId}_${fn.name}`;
          behaviorFunc = behaviorNode.functions.find((f) => f.name === fn.name);
        }
        label = `${fn.name}【B】`;
        // behavior 方法节点也在最底层
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
          position: { x: 0, y },
        });
      } else if (fn.isMiniProgramComponent) {
        const dirs = fileInfo.file.split("/");
        const compName = dirs[dirs.length - 2];
        label = compName + "【C】";
        y = 200; // 组件节点在第二层
      } else if (fn.isMiniProgramPage) {
        y = 200; // Page 节点在第二层
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
          position: { x: 0, y },
        });
        edges.push({
          data: { source: fileId, target: funcId, label: "contains" },
        });
      }
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
        // 判断是否为 usingComponents 里的组件
        const usingComp = (fileInfo.usingComponents || []).find(
          (c) => c.name === eventCall.component
        );
        if (usingComp) {
          // 直接从组件节点（如 World[C]）画 bindtap 到事件处理方法节点
          // 查找组件节点 id
          const compFile = usingComp.path;
          const compNode = nodes.find(
            (n) => n.data.type === "jsx" && n.data.file === compFile
          );
          console.log("compNode", compNode);
          const compNodeId = compNode && compNode.data.id;
          const targetId = funcNodeMap.get(
            `${fileInfo.file}:${eventCall.target}`
          );
          console.log("[event-bind-debug]", {
            usingComp,
            compFile,
            compNodeId,
            targetId,
            event: eventCall.event,
            target: eventCall.target,
          });
          if (compNodeId && targetId) {
            edges.push({
              data: {
                source: compNodeId,
                target: targetId,
                label: eventCall.event,
              },
            });
          }
        } else {
          // 原有逻辑：生成事件节点和 contains 边
          let pageId = null;
          if (fileInfo.functions.some((f) => f.isMiniProgramPage)) {
            pageId = funcNodeMap.get(`${fileInfo.file}:Page`);
          }
          let compType = "element";
          if (eventCall.component && /^[A-Z]/.test(eventCall.component)) {
            compType = "component";
          }
          const compLabel = eventCall.component || "元素";
          const compNodeId = `eventcomp_${fileInfo.file}_${compLabel}`;
          const compLoc = eventCall.loc || null;
          if (!nodes.some((n) => n.data.id === compNodeId)) {
            nodes.push({
              data: {
                id: compNodeId,
                label: compLabel,
                file: fileInfo.file,
                type: compType,
                loc: compLoc,
              },
              position: { x: 0, y: 400 },
            });
          }
          if (pageId) {
            edges.push({
              data: {
                source: pageId,
                target: compNodeId,
                label: "contains",
              },
            });
          }
          let targetId = funcNodeMap.get(
            `${fileInfo.file}:${eventCall.target}`
          );
          if (compNodeId && targetId) {
            edges.push({
              data: {
                source: compNodeId,
                target: targetId,
                label: eventCall.event,
              },
            });
          }
        }
      });
    }
  });

  // 生成 behaviors 节点
  const behaviorNodeMap = new Map();
  relations.forEach((fileInfo) => {
    const fileId = fileNodeMap.get(fileInfo.file);
    if (fileInfo.behaviors && fileInfo.behaviors.length > 0) {
      fileInfo.behaviors.forEach((bh) => {
        // bh.name 作为唯一标识
        if (!behaviorNodeMap.has(bh.name)) {
          const bhNodeId = `behavior_${bh.name}`;
          behaviorNodeMap.set(bh.name, bhNodeId);
          nodes.push({
            data: {
              id: bhNodeId,
              label: bh.name,
              type: "behavior",
            },
            position: { x: 0, y: 100 },
          });
        }
        const bhNodeId = behaviorNodeMap.get(bh.name);
        if (fileId && bhNodeId) {
          edges.push({
            data: {
              source: fileId,
              target: bhNodeId,
              label: "behavior",
            },
          });
        }
      });
    }
  });

  // behaviors/behavior.js → dataBehavior/eventBehavior → getData【B】/initEvent【B】链路
  relations.forEach((fileInfo) => {
    if (fileInfo.isBehavior) {
      const fileId = fileNodeMap.get(fileInfo.file);
      // 遍历所有引用了该 behavior 的文件
      relations.forEach((otherFile) => {
        if (otherFile.behaviors && otherFile.behaviors.length > 0) {
          otherFile.behaviors.forEach((bh) => {
            // 判断 importSource 是否指向当前 behavior 文件
            let importSource = bh.importSource || "";
            const importSourceBase = importSource
              .replace(/^\.\//, "")
              .replace(/^\.\.\//, "")
              .replace(/\.js$/, "")
              .split("/")
              .slice(-2)
              .join("/");
            const fileInfoBase = fileInfo.file
              .replace(/\\/g, "/")
              .split("/")
              .slice(-2)
              .join("/")
              .replace(/\.js$/, "");
            const resolved = fileInfoBase === importSourceBase;
            if (resolved) {
              const bhId = `behavior_${otherFile.file}_${bh.name}`;
              // 1. behavior.js → dataBehavior/eventBehavior 节点（export 边）
              edges.push({
                data: {
                  source: fileId,
                  target: bhId,
                  label: "export",
                },
              });
              // 2. behavior 节点 → 混入方法节点
              otherFile.functions.forEach((fn) => {
                if (
                  fn.fromBehavior &&
                  fn.behaviorFile === fileInfo.file &&
                  fn.behaviorName === bh.name
                ) {
                  const funcId = nodes.find(
                    (n) =>
                      n.data.label === `${fn.name}【B】` &&
                      n.data.file === fileInfo.file
                  )?.data.id;
                  if (funcId) {
                    edges.push({
                      data: {
                        source: bhId,
                        target: funcId,
                        label: "method",
                      },
                    });
                  }
                }
              });
            }
          });
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
    selector: "node[type='componentFile']",
    style: {
      label: "data(label)",
      "background-color": "#bbb",
      color: "#222",
      shape: "ellipse",
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
      width: 60,
      height: 36,
      padding: "4px",
    },
  },
  {
    selector: "edge[label='behavior']",
    style: {
      width: 2,
      "line-color": "#888",
      "target-arrow-color": "#888",
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
  {
    selector: "edge[label='export']",
    style: {
      width: 2,
      "line-color": "#888",
      "target-arrow-color": "#888",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "export",
    },
  },
  {
    selector: "edge[label='method']",
    style: {
      width: 2,
      "line-color": "#888",
      "target-arrow-color": "#888",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "method",
    },
  },
  {
    selector: "edge[label='usingComponent']",
    style: {
      width: 2,
      "line-color": "#00BFFF",
      "target-arrow-color": "#00BFFF",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "usingComponent",
    },
  },
];

async function main(searchBox) {
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

    // 折叠状态管理
    const collapsedNodes = new Map();
    function collapseNode(cy, nodeId) {
      const node = cy.getElementById(nodeId);
      // 递归隐藏所有下游节点和边
      const descendants = node.successors();
      descendants.forEach(ele => ele.hide());
      collapsedNodes.set(nodeId, true);
    }
    function expandNode(cy, nodeId) {
      const node = cy.getElementById(nodeId);
      // 递归显示所有下游节点和边
      const descendants = node.successors();
      descendants.forEach(ele => ele.show());
      collapsedNodes.set(nodeId, false);
    }
    function updateCollapseButtons(cy) {
      // 清除旧按钮
      document.querySelectorAll('.cy-collapse-btn').forEach(btn => btn.remove());
      cy.nodes(':visible').forEach(node => { // 只为可见节点生成按钮
        const nodePos = node.renderedPosition();
        const nodeId = node.id();
        // 只为有下游的节点加按钮
        if (node.outgoers('node').length === 0) return;
        const btn = document.createElement('div');
        btn.className = 'cy-collapse-btn';
        btn.style.position = 'absolute';
        btn.style.left = `${nodePos.x + cy.container().offsetLeft + 20}px`;
        btn.style.top = `${nodePos.y + cy.container().offsetTop - 10}px`;
        btn.style.zIndex = 10;
        btn.style.width = '18px';
        btn.style.height = '18px';
        btn.style.background = '#fff';
        btn.style.border = '1px solid #888';
        btn.style.borderRadius = '50%';
        btn.style.textAlign = 'center';
        btn.style.lineHeight = '18px';
        btn.style.cursor = 'pointer';
        btn.innerText = collapsedNodes.get(nodeId) ? '+' : '-';
        btn.onclick = (e) => {
          e.stopPropagation();
          if (collapsedNodes.get(nodeId)) {
            expandNode(cy, nodeId);
          } else {
            collapseNode(cy, nodeId);
          }
          updateCollapseButtons(cy);
        };
        document.body.appendChild(btn);
      });
    }

    cy.ready(() => {
      cy.fit();
      updateCollapseButtons(cy);
    });
    cy.on('pan zoom position', () => {
      updateCollapseButtons(cy);
    });
    cy.on('layoutstop', () => {
      updateCollapseButtons(cy);
    });

    // 搜索高亮功能
    function highlightNodesByKeyword(keyword) {
      cy.nodes().forEach(node => {
        const label = node.data('label') || '';
        if (keyword && label.toLowerCase().includes(keyword.toLowerCase())) {
          node.addClass('highlighted');
        } else {
          node.removeClass('highlighted');
        }
      });
      // 自动定位到第一个高亮节点
      const first = cy.nodes('.highlighted')[0];
      if (first) {
        cy.center(first);
        cy.zoom({ level: 2, renderedPosition: first.renderedPosition() });
      }
    }
    if (searchBox) {
      searchBox.oninput = function() {
        highlightNodesByKeyword(this.value);
      };
      searchBox.onkeydown = function(e) {
        if (e.key === 'Enter') {
          highlightNodesByKeyword(this.value);
        }
      };
    }

    // 节点点击跳转 cursor
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

  // 搜索框
  let searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.placeholder = '搜索节点/函数名...';
  searchBox.style = 'position:fixed;top:10px;left:10px;z-index:1001;width:220px;padding:4px 8px;font-size:15px;border:1px solid #bbb;border-radius:4px;';
  document.body.appendChild(searchBox);

  main(searchBox);
};

// 样式补充
const styleEl = document.createElement('style');
styleEl.innerHTML = `
.cy-collapse-btn {
  user-select: none;
  font-size: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.cy-node.highlighted, .highlighted {
  border-width: 4px !important;
  border-color: #ff5722 !important;
  background-color: #ffe0b2 !important;
  color: #d84315 !important;
  font-weight: bold !important;
  font-size: 18px !important;
}
`;
document.head.appendChild(styleEl);
