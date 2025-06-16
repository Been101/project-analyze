const path = require("path");
const fs = require("fs");
const glob = require("glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const JSON5 = require('json5');

// 默认分析 test-miniprogram 目录
// const targetDir = path.resolve(__dirname, "/Users/zhenglaibin/sqb/mp-membership-coupon/packages/campus-home/src/campus");
const targetDir = "/Users/zhenglaibin/sqb/mp-membership-coupon/packages/campus-home/src/campus";
console.log("分析目标目录:", targetDir);

// 支持的文件类型
const exts = ["js", "jsx", "ts", "tsx", "json5"];
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

// 添加 json5 文件读取函数
function readJson5File(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON5.parse(content);
}

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
        ["Page", "Component", "wComponent"].includes(path.parentPath.parent.callee.name)
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

// 解析文件内容
function parseFile(file) {
  const code = fs.readFileSync(file, "utf-8");
  let ast;
  let fileInfo = {
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
    ast: null,
  };

  try {
    // 如果是 json5 文件，使用 JSON5 解析
    if (file.endsWith('.json5')) {
      const jsonData = JSON5.parse(code);
      if (jsonData.usingComponents) {
        for (const [name, pathVal] of Object.entries(jsonData.usingComponents)) {
          let absPath = path.resolve(path.dirname(file), pathVal);
          if (!absPath.endsWith(".ts")) absPath += ".ts";
          fileInfo.usingComponents.push({ name, path: absPath });
        }
      }
      return fileInfo;
    }
    // 如果是 json 文件，使用 JSON 解析
    if (file.endsWith('.json')) {
      const jsonData = JSON.parse(code);
      if (jsonData.usingComponents) {
        for (const [name, pathVal] of Object.entries(jsonData.usingComponents)) {
          let absPath = path.resolve(path.dirname(file), pathVal);
          if (!absPath.endsWith(".ts")) absPath += ".ts";
          fileInfo.usingComponents.push({ name, path: absPath });
        }
      }
      return fileInfo;
    }

    // 对于 JS/TS 文件，使用 babel 解析
    const parserOptions = {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    };

    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      parserOptions.plugins = [
        "jsx",
        "typescript",
        "classProperties",
        "decorators-legacy"
      ];
    }

    ast = parser.parse(code, parserOptions);
    fileInfo.ast = ast;

    // 解析 AST
    traverse(ast, {
      // 检查是否为 Behavior 文件
      CallExpression(path) {
        if (path.node.callee && path.node.callee.name === "Behavior") {
          fileInfo.isBehavior = true;
        }
      },
    });

    // 记录 import 语句
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

    // 解析标准小程序 Component({ ... }) 的 methods 字段
    traverse(ast, {
      CallExpression(path) {
        if (
          path.node.callee &&
          path.node.callee.name === "Component" &&
          path.node.arguments &&
          path.node.arguments.length > 0
        ) {
          const arg = path.node.arguments[0];
          if (arg.type === "ObjectExpression") {
            const methodsProp = arg.properties.find(
              (p) => p.type === "ObjectProperty" && p.key.name === "methods"
            );
            if (methodsProp && methodsProp.value.type === "ObjectExpression") {
              methodsProp.value.properties.forEach((prop) => {
                if (
                  (prop.type === "ObjectMethod" || prop.type === "ObjectProperty") &&
                  prop.key &&
                  prop.key.name
                ) {
                  addFunctionIfNotExists(fileInfo.functions, {
                    name: prop.key.name,
                    loc: prop.loc || null,
                    isExportDefault: false,
                    isComponent: false,
                    isMiniProgramMethod: true,
                  });
                }
              });
            }
          }
        }
      },
    });

    // 解析 wComponent({ ... }) 的 methods 字段
    traverse(ast, {
      CallExpression(path) {
        if (
          path.node.callee &&
          path.node.callee.name === "wComponent" &&
          path.node.arguments &&
          path.node.arguments.length > 0
        ) {
          const arg = path.node.arguments[0];
          if (arg.type === "ObjectExpression") {
            const methodsProp = arg.properties.find(
              (p) => p.type === "ObjectProperty" && p.key.name === "methods"
            );
            if (methodsProp && methodsProp.value.type === "ObjectExpression") {
              methodsProp.value.properties.forEach((prop) => {
                if (
                  (prop.type === "ObjectMethod" || prop.type === "ObjectProperty") &&
                  prop.key &&
                  prop.key.name
                ) {
                  addFunctionIfNotExists(fileInfo.functions, {
                    name: prop.key.name,
                    loc: prop.loc || null,
                    isExportDefault: false,
                    isComponent: false,
                    isMiniProgramMethod: true,
                  });
                }
              });
            }
          }
        }
      },
    });

    // 检查是否提取到方法和事件
    if ((file.endsWith('.ts') || file.endsWith('.js')) && fileInfo.functions.length === 0) {
      console.log('[DEBUG] 未提取到方法:', file);
    }
    // 检查 jsxEventCalls
    const base = file.replace(/\.(js|jsx|ts|tsx|json5)$/, "");
    const wxmlPath = base + ".wxml";
    if (fileInfo.jsxEventCalls.length === 0 && fs.existsSync(wxmlPath)) {
      console.log('[DEBUG] 未提取到事件:', wxmlPath);
    }

    return fileInfo;
  } catch (e) {
    console.error(`解析失败: ${file}`);
    console.error('错误详情:', e.message);
    return fileInfo;
  }
}

// 新增：查找入口文件
function findEntryFile(targetDir) {
  const files = fs.readdirSync(targetDir);
  if (files.includes('index.ts')) return path.join(targetDir, 'index.ts');
  if (files.includes('index.tsx')) return path.join(targetDir, 'index.tsx');
  const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  if (tsFiles.length === 1) return path.join(targetDir, tsFiles[0]);
  if (tsFiles.length > 1) {
    const tsOnly = tsFiles.filter(f => f.endsWith('.ts'));
    if (tsOnly.length === 1) return path.join(targetDir, tsOnly[0]);
  }
  return null;
}

// 递归分析依赖链
const visited = new Set();
function analyzeFileRecursively(file) {
  if (visited.has(file)) return;
  visited.add(file);
  console.log('[DEBUG] 递归分析文件:', file);
  const fileInfo = parseFile(file);

  // ts/tsx 文件合并同名 .json5/.json 的 usingComponents
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    const base = file.replace(/\.(ts|tsx)$/, '');
    const json5Path = base + '.json5';
    const jsonPath = base + '.json';
    let usingComponents = fileInfo.usingComponents || [];
    if (fs.existsSync(json5Path)) {
      const json5Info = parseFile(json5Path);
      if (json5Info.usingComponents && json5Info.usingComponents.length > 0) {
        usingComponents = usingComponents.concat(json5Info.usingComponents);
      }
    }
    if (fs.existsSync(jsonPath)) {
      const jsonInfo = parseFile(jsonPath);
      if (jsonInfo.usingComponents && jsonInfo.usingComponents.length > 0) {
        usingComponents = usingComponents.concat(jsonInfo.usingComponents);
      }
    }
    if (usingComponents.length > 0) {
      fileInfo.usingComponents = usingComponents;
    }
  }

  relations.push(fileInfo);

  // 递归分析 usingComponents
  if (fileInfo.usingComponents && fileInfo.usingComponents.length > 0) {
    fileInfo.usingComponents.forEach(comp => {
      if (comp.path) {
        let absPath = comp.path;
        if (!path.isAbsolute(absPath)) {
          absPath = path.resolve(path.dirname(file), comp.path);
        }
        if (fs.existsSync(absPath)) {
          analyzeFileRecursively(absPath);
        }
      }
    });
  }
}

// 入口文件查找
const entryFile = findEntryFile(targetDir);
if (!entryFile) {
  console.error('未找到入口文件');
  process.exit(1);
}
console.log('入口文件:', entryFile);
analyzeFileRecursively(entryFile);

// 最终输出所有文件的 usingComponents 字段
console.log('\n[SUMMARY] 所有文件的 usingComponents 字段:');
// console.log(relations.map(r => ({ file: r.file, usingComponents: r.usingComponents })));

console.log('解析完成，共处理文件数:', relations.length);
// console.log('组件关系:', relations.map(r => ({
//   file: r.file,
//   usingComponents: r.usingComponents,
//   behaviors: r.behaviors,
//   functions: r.functions.map(f => f.name)
// })));


fs.writeFileSync(
  path.resolve( "/Users/zhenglaibin/demo/project-analyze/web/public/miniprogram-relation.json"),
  JSON.stringify({ relations }, null, 2),
  "utf-8"
);

console.log("调用/引用关系已输出到 relation.json");
