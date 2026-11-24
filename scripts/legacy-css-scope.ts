import { AtRule, type Plugin } from 'postcss';

// Keep legacy element rules and light-only variables inside their route.
export function legacyCssScope(): Plugin {
  return {
    postcssPlugin: 'daily-legacy-scope',
    Once(root, { result }) {
      const file = (result.opts.from ?? '').replaceAll('\\', '/');
      if (
        !/\/src\/(styles|presentation|daily\/(material|dialog|daily|input-workflow)|water-level\/water|account\/account)\.css$/.test(
          file,
        )
      )
        return;
      root.walkRules((rule) => {
        rule.selector = rule.selector.replace(/:root|\bhtml\b|\bbody\b/g, ':scope');
      });
      const scope = new AtRule({ name: 'scope', params: '(.legacy-route)' });
      scope.append(...root.nodes);
      root.append(scope);
    },
  };
}
