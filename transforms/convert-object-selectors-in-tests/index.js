const { getParser } = require('codemod-cli').jscodeshift;
const { getOptions } = require('codemod-cli');

function hasAssertDomOrFind({ callee }) {
  const hasAssertDom =
    callee.object &&
    callee.property &&
    callee.object.name === 'assert' &&
    callee.property.name === 'dom';
  const hasFind = callee.name === 'find';
  return hasAssertDom || hasFind;
}

module.exports = function transformer(file, api) {
  const j = getParser(api);
  const root = j(file.source);
  // find all the object selectors in assert, like assert.dom(SELECTORS.NAME) or find(SELECTORS.NAME)
  const selectors = root
    .find(j.CallExpression, hasAssertDomOrFind)
    .filter(
      p =>
        p.value.arguments[0] && p.value.arguments[0].type === 'MemberExpression'
    );
  // for each object selector, try to find its associated definition and the string value,
  // e.g. if we have assert.dom(SELECTORS.NAME), look for const SELECTORS = { NAME: '[data-test-foo]' } }
  selectors.forEach(p => {
    const result = p.value.arguments[0];
    if (!result.object) {
      return;
    }
    // this should be the name for the object selector, e.g. 'SELECTORS'
    const objectIdentifierName =
      result.object.name || (result.object.object && result.object.object.name);
    // this should be the object property key, e.g. 'NAME'
    const keyName = result.property && result.property.name;

    let objectExpressions = root
      .findVariableDeclarators(objectIdentifierName)
      .find(j.ObjectExpression);

    // go one level deeper if the node we're currently looking at is still a MemberExpression
    // this accounts for something like SELECTORS.AT.NAME
    if (result.object.type === 'MemberExpression') {
      objectExpressions = objectExpressions.find(j.ObjectExpression);
    }

    const keyPaths = objectExpressions.find(j.ObjectProperty, {
      key: {
        name: keyName,
      },
    });

    if (keyPaths.length) {
      const { node } = keyPaths.get(0);
      const value = node.value && node.value.value;
      if (value) {
        p.value.arguments[0] = j.stringLiteral(value);
      }
    }
  });

  return root.toSource({ quote: 'single' });
}
