const path = require("path");
const fs = require("fs");
const glob = require("glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// 默认分析 test-miniprogram 目录
const targetDir = path.resolve(__dirname, "./test-miniprogram");
console.log("分析目标目录:", targetDir);

// 支持的文件类型
const exts = ["js", "jsx", "ts", "tsx"];
const patterns = exts.map((ext) => path.join(targetDir, "**", `*.${ext}`));

// 获取所有相关文件
let files = [];
patterns.forEach((pattern) => {
  files = files.concat(glob.sync(pattern, { nodir: true }));
});

console.log("待分析文件数:", files.length);
// console.log("文件列表:", files);

const relations = [];
const globalFunctions = [];

function isComponentName(name) {
  return name && /^[A-Z]/.test(name);
}

function extractJSXComponentTree(node, parent, result) {
  if (!node || !node.children) return;
  node.children.forEach((child) => {
    if (
      child.type === "JSXElement" &&
      child.openingElement &&
      child.openingElement.name.type === "JSXIdentifier"
    ) {
      // 组件或原生标签都记录
      result.push({
        parent,
        child: child.openingElement.name.name,
        loc: child.loc,
      });
      // 递归子树
      extractJSXComponentTree(child, child.openingElement.name.name, result);
    }
  });
}

function addFunctionIfNotExists(functions, fn) {
  if (!functions.some((f) => f.name === fn.name)) {
    functions.push(fn);
  }
}

const parseMethodsFromPageOrComponent = (
  ast,
  fileInfo,
  behaviorsMethodsMap
) => {
  traverse(ast, {
    ObjectProperty(path) {
      if (
        path.node.key.name === "methods" &&
        path.node.value.type === "ObjectExpression"
      ) {
        path.node.value.properties.forEach((prop) => {
          if (
            (prop.type === "ObjectMethod" || prop.type === "ObjectProperty") &&
            prop.key &&
            prop.key.name
          ) {
            if (prop.key.name === "getList") {
              // console.log("getList AST:", JSON.stringify(prop, null, 2));
            }
            addFunctionIfNotExists(fileInfo.functions, {
              name: prop.key.name,
              loc: prop.loc || null,
              isExportDefault: false,
              isComponent: false,
              isMiniProgramMethod: true,
            });
            // 新增：分析 this.XXX() 调用
            // 1. ObjectMethod
            if (prop.body && prop.body.body) {
              prop.body.body.forEach((stmt) => {
                if (
                  stmt.type === "ExpressionStatement" &&
                  stmt.expression.type === "CallExpression"
                ) {
                  const callee = stmt.expression.callee;
                  if (
                    callee.type === "MemberExpression" &&
                    callee.object.type === "ThisExpression" &&
                    callee.property.type === "Identifier"
                  ) {
                    const calledName = callee.property.name;
                    if (
                      behaviorsMethodsMap &&
                      behaviorsMethodsMap[calledName]
                    ) {
                      // console.log(
                      //   "functionCalls push (behavior)",
                      //   prop.key.name,
                      //   calledName,
                      //   behaviorsMethodsMap[calledName]
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                        targetFile: behaviorsMethodsMap[calledName].file,
                        targetLoc: behaviorsMethodsMap[calledName].loc,
                        fromBehavior: true,
                      });
                    } else {
                      // console.log(
                      //   "functionCalls push (local)",
                      //   prop.key.name,
                      //   calledName
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                      });
                    }
                  }
                }

                if (
                  stmt.type === "ReturnStatement" &&
                  stmt.argument.type === "CallExpression"
                ) {
                  const callee = stmt.argument.callee;
                  if (
                    callee.type === "MemberExpression" &&
                    callee.object.type === "ThisExpression" &&
                    callee.property.type === "Identifier"
                  ) {
                    const calledName = callee.property.name;
                    if (
                      behaviorsMethodsMap &&
                      behaviorsMethodsMap[calledName]
                    ) {
                      // console.log(
                      //   "functionCalls push (behavior)",
                      //   prop.key.name,
                      //   calledName,
                      //   behaviorsMethodsMap[calledName]
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                        targetFile: behaviorsMethodsMap[calledName].file,
                        targetLoc: behaviorsMethodsMap[calledName].loc,
                        fromBehavior: true,
                      });
                    } else {
                      // console.log(
                      //   "functionCalls push (local)",
                      //   prop.key.name,
                      //   calledName
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                      });
                    }
                  }
                }
              });
            }
            // 2. ObjectProperty + FunctionExpression
            if (
              prop.type === "ObjectProperty" &&
              prop.value &&
              prop.value.type === "FunctionExpression" &&
              prop.value.body &&
              prop.value.body.body
            ) {
              prop.value.body.body.forEach((stmt) => {
                if (
                  stmt.type === "ExpressionStatement" &&
                  stmt.expression.type === "CallExpression"
                ) {
                  const callee = stmt.expression.callee;
                  if (
                    callee.type === "MemberExpression" &&
                    callee.object.type === "ThisExpression" &&
                    callee.property.type === "Identifier"
                  ) {
                    const calledName = callee.property.name;
                    if (
                      behaviorsMethodsMap &&
                      behaviorsMethodsMap[calledName]
                    ) {
                      // console.log(
                      //   "functionCalls push (behavior)",
                      //   prop.key.name,
                      //   calledName,
                      //   behaviorsMethodsMap[calledName]
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                        targetFile: behaviorsMethodsMap[calledName].file,
                        targetLoc: behaviorsMethodsMap[calledName].loc,
                        fromBehavior: true,
                      });
                    } else {
                      // console.log(
                      //   "functionCalls push (local)",
                      //   prop.key.name,
                      //   calledName
                      // );
                      fileInfo.functionCalls.push({
                        caller: prop.key.name,
                        name: calledName,
                      });
                    }
                  }
                }
              });
            }
          }
        });
      }
    },
    // 直接在 Page({ ... })/Component({ ... }) 一级的简写方法
    ObjectMethod(path) {
      if (
        path.parent &&
        path.parent.type === "ObjectExpression" &&
        path.parentPath.parent &&
        path.parentPath.parent.callee &&
        ["Page", "Component"].includes(path.parentPath.parent.callee.name)
      ) {
        if (
          path.node.key &&
          path.node.key.name &&
          path.node.key.name !== "data"
        ) {
          addFunctionIfNotExists(fileInfo.functions, {
            name: path.node.key.name,
            loc: path.node.loc || null,
            isExportDefault: false,
            isComponent: false,
            isMiniProgramMethod: true,
          });
          // 新增：分析 this.XXX() 调用
          if (path.node.body && path.node.body.body) {
            path.node.body.body.forEach((stmt) => {
              // 1. 直接 return this.xxx()
              if (
                stmt.type === "ReturnStatement" &&
                stmt.argument &&
                stmt.argument.type === "CallExpression"
              ) {
                const callee = stmt.argument.callee;
                if (
                  callee.type === "MemberExpression" &&
                  callee.object.type === "ThisExpression" &&
                  callee.property.type === "Identifier"
                ) {
                  const calledName = callee.property.name;
                  if (behaviorsMethodsMap && behaviorsMethodsMap[calledName]) {
                    fileInfo.functionCalls.push({
                      caller: path.node.key.name,
                      name: calledName,
                      targetFile: behaviorsMethodsMap[calledName].file,
                      targetLoc: behaviorsMethodsMap[calledName].loc,
                      fromBehavior: true,
                    });
                  } else {
                    fileInfo.functionCalls.push({
                      caller: path.node.key.name,
                      name: calledName,
                    });
                  }
                }
              }
              // 2. 语句块内 this.xxx() 调用
              if (
                stmt.type === "ExpressionStatement" &&
                stmt.expression.type === "CallExpression"
              ) {
                const callee = stmt.expression.callee;
                if (
                  callee.type === "MemberExpression" &&
                  callee.object.type === "ThisExpression" &&
                  callee.property.type === "Identifier"
                ) {
                  const calledName = callee.property.name;
                  if (behaviorsMethodsMap && behaviorsMethodsMap[calledName]) {
                    fileInfo.functionCalls.push({
                      caller: path.node.key.name,
                      name: calledName,
                      targetFile: behaviorsMethodsMap[calledName].file,
                      targetLoc: behaviorsMethodsMap[calledName].loc,
                      fromBehavior: true,
                    });
                  } else {
                    fileInfo.functionCalls.push({
                      caller: path.node.key.name,
                      name: calledName,
                    });
                  }
                }
              }
            });
          }
        }
      }
    },
  });
};

files.forEach((file) => {
  const code = fs.readFileSync(file, "utf-8");
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (e) {
    console.error(`解析失败: ${file}`);
    return;
  }
  const fileInfo = {
    file,
    imports: [],
    functions: [],
    functionCalls: [],
    jsxComponents: [],
    jsxContains: [],
    jsxComponentTree: [],
    jsxEventCalls: [],
    usingComponents: [],
    behaviors: [],
  };
  let exportDefaultName = null;
  traverse(ast, {
    // 检查是否为 Behavior 文件
    CallExpression(path) {
      if (path.node.callee && path.node.callee.name === "Behavior") {
        fileInfo.isBehavior = true;
      }
    },
    // ...可选：可补充函数声明、调用等分析...
  });
  // 记录 import { X } from '...' 语法
  traverse(ast, {
    ImportDeclaration(path) {
      fileInfo.imports.push({
        source: path.node.source.value,
        specifiers: path.node.specifiers.map((s) => s.local.name),
      });
    },
  });
  // 解析 behaviors 字段
  traverse(ast, {
    ObjectProperty(path) {
      if (
        path.node.key.name === "behaviors" &&
        path.node.value.type === "ArrayExpression"
      ) {
        path.node.value.elements.forEach((el) => {
          if (el.type === "Identifier") {
            // 在 imports 里查找路径
            const imp = fileInfo.imports.find((i) =>
              i.specifiers.includes(el.name)
            );
            fileInfo.behaviors.push({
              name: el.name,
              importSource: imp ? imp.source : null,
            });
          }
        });
      }
    },
  });
  // 查找同目录同名 .json/.wxml
  const base = file.replace(/\.(js|jsx|ts|tsx)$/, "");
  const jsonPath = base + ".json";
  if (fs.existsSync(jsonPath)) {
    try {
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (jsonData.usingComponents) {
        for (const [name, pathVal] of Object.entries(
          jsonData.usingComponents
        )) {
          // 归一化为绝对路径，并补全 .js 后缀
          let absPath = path.resolve(path.dirname(jsonPath), pathVal);
          if (!absPath.endsWith(".js")) absPath += ".js";
          fileInfo.usingComponents.push({ name, path: absPath });
        }
      }
    } catch (e) {
      // ignore
    }
  }
  const wxmlPath = base + ".wxml";
  if (fs.existsSync(wxmlPath)) {
    const wxml = fs.readFileSync(wxmlPath, "utf-8");
    // 匹配如 <button bindtap="handleTap"> 或 <view bindtap='handleTap'>，兼容属性顺序
    const eventRegex =
      /<([a-zA-Z0-9_-]+)[^>]*?\s(bind\w+)=(?:"|')([a-zA-Z0-9_]+)(?:"|')/g;
    let match;
    while ((match = eventRegex.exec(wxml))) {
      // 计算行号
      const before = wxml.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      fileInfo.jsxEventCalls.push({
        component: match[1] || "",
        event: match[2],
        target: match[3],
        loc: {
          file: wxmlPath,
          line,
        },
      });
    }
  }
  // 收集所有 behaviors 方法
  let behaviorsMethodsMap = {};
  if (fileInfo.behaviors && fileInfo.behaviors.length > 0) {
    fileInfo.behaviors.forEach((bh) => {
      let bhPath = bh.importSource;
      if (bhPath) {
        const absBhPath = path.resolve(path.dirname(file), bhPath);
        const behaviorFile = files.find(
          (f) => f.replace(/\\/g, "/") === absBhPath + ".js"
        );
        if (behaviorFile) {
          try {
            const bhCode = fs.readFileSync(behaviorFile, "utf-8");
            const bhAst = parser.parse(bhCode, {
              sourceType: "module",
              plugins: ["jsx", "typescript"],
            });
            traverse(bhAst, {
              VariableDeclarator(path) {
                if (path.node.id.name === bh.name) {
                  path.traverse({
                    ObjectProperty(path) {
                      if (
                        path.node.key.name === "methods" &&
                        path.node.value.type === "ObjectExpression"
                      ) {
                        path.node.value.properties.forEach((prop) => {
                          if (
                            (prop.type === "ObjectMethod" ||
                              prop.type === "ObjectProperty") &&
                            prop.key &&
                            prop.key.name
                          ) {
                            console.log("bh.name", bh.name);
                            console.log("prop.key.name", prop.key.name);
                            addFunctionIfNotExists(fileInfo.functions, {
                              name: prop.key.name,
                              loc: prop.loc || null,
                              isExportDefault: false,
                              isComponent: false,
                              isMiniProgramMethod: true,
                              fromBehavior: true,
                              behaviorName: bh.name,
                              behaviorFile: behaviorFile,
                            });
                            // 关键：补充 behaviorsMethodsMap
                            behaviorsMethodsMap[prop.key.name] = {
                              file: behaviorFile,
                              loc: prop.loc || null,
                            };
                          }
                        });
                      }
                    },
                  });
                }
              },
            });
          } catch (e) {}
        }
      }
    });
  }
  // Page/Component/Behavior 方法提取
  if (code.includes("Page({")) {
    // 强制添加页面节点
    addFunctionIfNotExists(fileInfo.functions, {
      name: "Page",
      loc: null,
      isExportDefault: false,
      isComponent: false,
      isMiniProgramPage: true,
    });
    // 1. 先补全 behaviorsMethodsMap（包括所有 behaviors 方法）
    if (fileInfo.behaviors && fileInfo.behaviors.length > 0) {
      fileInfo.behaviors.forEach((bh) => {
        let bhPath = bh.importSource;
        if (bhPath) {
          const absBhPath = path.resolve(path.dirname(file), bhPath);
          const behaviorFile = files.find(
            (f) => f.replace(/\\/g, "/") === absBhPath + ".js"
          );
          if (behaviorFile) {
            try {
              const bhCode = fs.readFileSync(behaviorFile, "utf-8");
              const bhAst = parser.parse(bhCode, {
                sourceType: "module",
                plugins: ["jsx", "typescript"],
              });
              console.log("bhAst ---> ");
              traverse(bhAst, {
                VariableDeclarator(path) {
                  if (path.node.id.name === bh.name) {
                    path.traverse({
                      ObjectProperty(path) {
                        if (
                          path.node.key.name === "methods" &&
                          path.node.value.type === "ObjectExpression"
                        ) {
                          path.node.value.properties.forEach((prop) => {
                            if (
                              (prop.type === "ObjectMethod" ||
                                prop.type === "ObjectProperty") &&
                              prop.key &&
                              prop.key.name
                            ) {
                              console.log("bh.name", bh.name);
                              console.log("prop.key.name", prop.key.name);
                              addFunctionIfNotExists(fileInfo.functions, {
                                name: prop.key.name,
                                loc: prop.loc || null,
                                isExportDefault: false,
                                isComponent: false,
                                isMiniProgramMethod: true,
                                fromBehavior: true,
                                behaviorName: bh.name,
                                behaviorFile: behaviorFile,
                              });
                              // 关键：补充 behaviorsMethodsMap
                              behaviorsMethodsMap[prop.key.name] = {
                                file: behaviorFile,
                                loc: prop.loc || null,
                              };
                            }
                          });
                        }
                      },
                    });
                  }
                },
              });
            } catch (e) {}
          }
        }
      });
    }
    // 2. behaviorsMethodsMap 补全后，统一分析 methods，确保 this.getData() 能识别 behavior 方法
    parseMethodsFromPageOrComponent(ast, fileInfo, behaviorsMethodsMap);
  }
  if (code.includes("Component({")) {
    // 强制添加组件节点
    addFunctionIfNotExists(fileInfo.functions, {
      name: "Component",
      loc: null,
      isExportDefault: false,
      isComponent: true,
      isMiniProgramComponent: true,
    });
    parseMethodsFromPageOrComponent(ast, fileInfo, behaviorsMethodsMap);
  }
  // 对所有 js 文件都提取 methods 下的方法（包括 behavior）
  parseMethodsFromPageOrComponent(ast, fileInfo, behaviorsMethodsMap);
  // 在 relations.push(fileInfo) 前输出 home/home.js 的 functionCalls
  if (fileInfo.file.includes("home/home.js")) {
    // console.log("home/home.js functionCalls:", fileInfo.functionCalls);
  }
  relations.push(fileInfo);
});

fs.writeFileSync(
  path.join(process.cwd(), "relation.json"),
  JSON.stringify({ relations }, null, 2),
  "utf-8"
);

console.log("调用/引用关系已输出到 relation.json");
