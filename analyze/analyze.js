const path = require("path");
const fs = require("fs");
const glob = require("glob");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// 跳过 '--' 参数，获取第一个非 '--' 的参数作为目标目录
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length < 1) {
  console.error("用法: node analyze/analyze.js <target-project-path>");
  process.exit(1);
}

const targetDir = path.resolve(args[0]);

// 支持的文件类型
const exts = ["js", "jsx", "ts", "tsx"];
const patterns = exts.map((ext) => path.join(targetDir, `**/*.${ext}`));

// 获取所有相关文件
let files = [];
patterns.forEach((pattern) => {
  files = files.concat(glob.sync(pattern, { nodir: true }));
});

console.log("待分析文件数:", files.length);

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

// 先收集所有函数的全局表
files.forEach((file) => {
  const code = fs.readFileSync(file, "utf-8");
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (e) {
    return;
  }
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id && path.node.id.name;
      if (name) {
        globalFunctions.push({
          name,
          file,
          loc: path.node.loc,
        });
      }
    },
  });
});

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
  };
  let exportDefaultName = null;
  traverse(ast, {
    ImportDeclaration(path) {
      fileInfo.imports.push({
        source: path.node.source.value,
        specifiers: path.node.specifiers.map((s) => s.local.name),
      });
    },
    ExportDefaultDeclaration(path) {
      if (
        path.node.declaration.type === "FunctionDeclaration" &&
        path.node.declaration.id
      ) {
        exportDefaultName = path.node.declaration.id.name;
      } else if (path.node.declaration.type === "Identifier") {
        exportDefaultName = path.node.declaration.name;
      }
    },
    FunctionDeclaration(path) {
      const name = path.node.id && path.node.id.name;
      const isExportDefault = name && name === exportDefaultName;
      let jsxReturn = null;
      // 收集该函数体内的所有调用
      path.traverse({
        ReturnStatement(retPath) {
          if (
            retPath.node.argument &&
            (retPath.node.argument.type === "JSXElement" ||
              retPath.node.argument.type === "JSXFragment")
          ) {
            jsxReturn = retPath.node.argument;
          }
        },
        CallExpression(callPath) {
          if (callPath.node.callee.type === "Identifier") {
            const target = globalFunctions.find(
              (fn) => fn.name === callPath.node.callee.name
            );
            fileInfo.functionCalls.push({
              name: callPath.node.callee.name,
              loc: callPath.node.loc,
              targetFile: target ? target.file : null,
              targetLoc: target ? target.loc : null,
              caller: name,
            });
          }
        },
      });
      fileInfo.functions.push({
        name,
        loc: path.node.loc,
        isExportDefault,
        isComponent: !!jsxReturn,
      });
      if (jsxReturn) {
        extractJSXComponentTree(jsxReturn, name, fileInfo.jsxComponentTree);
      }
    },
    JSXOpeningElement(path) {
      if (path.node.name.type === "JSXIdentifier") {
        fileInfo.jsxComponents.push({
          name: path.node.name.name,
          loc: path.node.loc,
        });
        // 事件绑定分析
        const eventProps = ["onClick", "onChange", "onInput", "onSubmit"];
        (path.node.attributes || []).forEach((attr) => {
          if (
            attr.type === "JSXAttribute" &&
            eventProps.includes(attr.name.name) &&
            attr.value &&
            attr.value.type === "JSXExpressionContainer" &&
            attr.value.expression.type === "Identifier"
          ) {
            fileInfo.jsxEventCalls.push({
              component: path.node.name.name,
              event: attr.name.name,
              target: attr.value.expression.name,
              loc: attr.loc,
            });
          }
        });
      }
    },
  });
  relations.push(fileInfo);
});

fs.writeFileSync(
  path.join(process.cwd(), "relation.json"),
  JSON.stringify({ relations }, null, 2),
  "utf-8"
);

console.log("调用/引用关系已输出到 relation.json");
