import type { Tool } from '../core/types';

const STEERING_SEPARATOR = '\n\n--- EXPERT GUIDANCE ---\n';

/**
 * Injects expert guidance (steering) into tool descriptions
 */
export class SteeringInjector {
  /**
   * Inject steering into all tools
   * @param tools Original tools from child server
   * @param steering Expert guidance text
   * @returns Tools with enhanced descriptions
   */
  inject(tools: ReadonlyArray<Tool>, steering: string | undefined): Tool[] {
    if (steering === undefined || steering === null || steering.trim().length === 0) {
      return [...tools];
    }

    return tools.map((tool) => this.injectOne(tool, steering));
  }

  /**
   * Inject steering into single tool
   */
  private injectOne(tool: Tool, steering: string): Tool {
    return {
      ...tool,
      description: this.enhanceDescription(tool.description, steering),
    };
  }

  /**
   * Enhance description with steering
   */
  private enhanceDescription(original: string, steering: string): string {
    return `${original}${STEERING_SEPARATOR}${steering}`;
  }
}
