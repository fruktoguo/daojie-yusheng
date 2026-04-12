import { TECHNIQUE_CONSTELLATION_NODE_NAMES } from '../../constants/ui/technique-constellation';

/** TechniqueConstellationMilestone：定义该类型的结构与数据语义。 */
type TechniqueConstellationMilestone = '小成' | '大成' | '圆满';

/** TechniqueConstellationNode：定义该类型的结构与数据语义。 */
type TechniqueConstellationNode = {
/** level：定义该变量以承载业务值。 */
  level: number;
  milestone?: TechniqueConstellationMilestone;
/** hoverTitle：定义该变量以承载业务值。 */
  hoverTitle: string;
/** hoverLines：定义该变量以承载业务值。 */
  hoverLines: string[];
};

/** TechniqueConstellationCanvasData：定义该类型的结构与数据语义。 */
export type TechniqueConstellationCanvasData = {
/** techniqueName：定义该变量以承载业务值。 */
  techniqueName: string;
/** maxLevels：定义该变量以承载业务值。 */
  maxLevels: number;
/** currentLevel：定义该变量以承载业务值。 */
  currentLevel: number;
/** expPercent：定义该变量以承载业务值。 */
  expPercent: number;
/** selectedLevel：定义该变量以承载业务值。 */
  selectedLevel: number;
/** nodes：定义该变量以承载业务值。 */
  nodes: TechniqueConstellationNode[];
};

/** TechniqueConstellationHoverPayload：定义该类型的结构与数据语义。 */
export type TechniqueConstellationHoverPayload = {
/** level：定义该变量以承载业务值。 */
  level: number;
/** title：定义该变量以承载业务值。 */
  title: string;
/** lines：定义该变量以承载业务值。 */
  lines: string[];
};

/** InternalNode：定义该类型的结构与数据语义。 */
type InternalNode = TechniqueConstellationNode & {
/** index：定义该变量以承载业务值。 */
  index: number;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** displayX：定义该变量以承载业务值。 */
  displayX: number;
/** displayY：定义该变量以承载业务值。 */
  displayY: number;
/** baseRadius：定义该变量以承载业务值。 */
  baseRadius: number;
/** phase：定义该变量以承载业务值。 */
  phase: number;
/** speed：定义该变量以承载业务值。 */
  speed: number;
/** floatPhaseX：定义该变量以承载业务值。 */
  floatPhaseX: number;
/** floatPhaseY：定义该变量以承载业务值。 */
  floatPhaseY: number;
/** floatSpeed：定义该变量以承载业务值。 */
  floatSpeed: number;
/** anchorDirX：定义该变量以承载业务值。 */
  anchorDirX: number;
/** anchorDirY：定义该变量以承载业务值。 */
  anchorDirY: number;
};

/** RawNode：定义该类型的结构与数据语义。 */
type RawNode = InternalNode;

/** Particle：定义该类型的结构与数据语义。 */
type Particle = {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** size：定义该变量以承载业务值。 */
  size: number;
/** speedX：定义该变量以承载业务值。 */
  speedX: number;
/** speedY：定义该变量以承载业务值。 */
  speedY: number;
/** baseAlpha：定义该变量以承载业务值。 */
  baseAlpha: number;
/** phase：定义该变量以承载业务值。 */
  phase: number;
};

/** cyrb53：定义该变量以承载业务值。 */
const cyrb53 = (str: string, seed = 0): number => {
/** h1：定义该变量以承载业务值。 */
  let h1 = 0xdeadbeef ^ seed;
/** h2：定义该变量以承载业务值。 */
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/** PRNG：封装相关状态与行为。 */
class PRNG {
/** 构造函数：执行实例初始化流程。 */
  constructor(private seed: number) {}

/** next：执行对应的业务逻辑。 */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

/** nextRange：执行对应的业务逻辑。 */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

/** nextInt：执行对应的业务逻辑。 */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }

/** pick：执行对应的业务逻辑。 */
  pick<T>(array: readonly T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

/** TechniqueConstellationCanvas：封装相关状态与行为。 */
export class TechniqueConstellationCanvas {
/** canvas：定义该变量以承载业务值。 */
  private canvas: HTMLCanvasElement;
/** ctx：定义该变量以承载业务值。 */
  private ctx: CanvasRenderingContext2D;
/** skillLines：定义该变量以承载业务值。 */
  private skillLines: SVGSVGElement | null;
  private skillAnchors: Array<{
/** level：定义该变量以承载业务值。 */
    level: number;
/** index：定义该变量以承载业务值。 */
    index: number;
/** labelEl：定义该变量以承载业务值。 */
    labelEl: HTMLElement;
/** lineEl：定义该变量以承载业务值。 */
    lineEl: SVGPolylineElement | null;
  }> = [];
/** resizeObserver：定义该变量以承载业务值。 */
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId = 0;
/** particles：定义该变量以承载业务值。 */
  private particles: Particle[] = [];
/** currentNodes：定义该变量以承载业务值。 */
  private currentNodes: InternalNode[] = [];
  private pixelWidth = 0;
  private pixelHeight = 0;
/** hoveredLevel：定义该变量以承载业务值。 */
  private hoveredLevel: number | null = null;
  private mounted = false;
  private openedAt = 0;
/** state：定义该变量以承载业务值。 */
  private state: TechniqueConstellationCanvasData;

  constructor(
    private root: HTMLElement,
    initialState: TechniqueConstellationCanvasData,
    private readonly onSelectLevel: (level: number) => void,
    private readonly onNodeHover: (payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number) => void,
    private readonly onNodeMove: (clientX: number, clientY: number) => void,
    private readonly onNodeLeave: () => void,
  ) {
/** canvas：定义该变量以承载业务值。 */
    const canvas = root.querySelector<HTMLCanvasElement>('[data-tech-starfield-canvas="true"]');
    if (!canvas) {
      throw new Error('Technique constellation canvas root is incomplete.');
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Unable to acquire 2D context for technique constellation canvas.');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.skillLines = root.querySelector<SVGSVGElement>('[data-tech-starfield-skill-lines="true"]');
    this.state = initialState;
    this.mount();
  }

/** update：执行对应的业务逻辑。 */
  update(nextState: TechniqueConstellationCanvasData): void {
/** shouldRebuildNodes：定义该变量以承载业务值。 */
    const shouldRebuildNodes = this.state.techniqueName !== nextState.techniqueName || this.state.maxLevels !== nextState.maxLevels;
    this.state = nextState;
    if (shouldRebuildNodes) {
      this.rebuildScene();
      return;
    }
    this.syncNodeMetadata();
    this.updateCursor();
  }

/** destroy：执行对应的业务逻辑。 */
  destroy(): void {
    if (!this.mounted) {
      return;
    }
    this.mounted = false;
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('click', this.handleClick);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    this.onNodeLeave();
  }

/** mount：执行对应的业务逻辑。 */
  private mount(): void {
    this.mounted = true;
    this.openedAt = performance.now();
    this.collectSkillAnchors();
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.addEventListener('click', this.handleClick);
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeAndRebuild();
    });
    this.resizeObserver.observe(this.root);
    this.resizeAndRebuild();
    this.animationFrameId = requestAnimationFrame(this.render);
  }

/** resizeAndRebuild：执行对应的业务逻辑。 */
  private resizeAndRebuild(): void {
/** cssWidth：定义该变量以承载业务值。 */
    const cssWidth = Math.max(1, Math.floor(this.root.clientWidth));
/** cssHeight：定义该变量以承载业务值。 */
    const cssHeight = Math.max(1, Math.floor(this.root.clientHeight));
/** bounds：定义该变量以承载业务值。 */
    const bounds = this.root.getBoundingClientRect();
/** viewportScaleX：定义该变量以承载业务值。 */
    const viewportScaleX = cssWidth > 0 && bounds.width > 0 ? bounds.width / cssWidth : 1;
/** viewportScaleY：定义该变量以承载业务值。 */
    const viewportScaleY = cssHeight > 0 && bounds.height > 0 ? bounds.height / cssHeight : 1;
/** dpr：定义该变量以承载业务值。 */
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
/** pixelRatioX：定义该变量以承载业务值。 */
    const pixelRatioX = dpr * viewportScaleX;
/** pixelRatioY：定义该变量以承载业务值。 */
    const pixelRatioY = dpr * viewportScaleY;
/** nextWidth：定义该变量以承载业务值。 */
    const nextWidth = Math.max(1, Math.floor(cssWidth * pixelRatioX));
/** nextHeight：定义该变量以承载业务值。 */
    const nextHeight = Math.max(1, Math.floor(cssHeight * pixelRatioY));
    if (this.pixelWidth === nextWidth && this.pixelHeight === nextHeight) {
      return;
    }
    this.pixelWidth = nextWidth;
    this.pixelHeight = nextHeight;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(pixelRatioX, pixelRatioY);
    this.rebuildScene();
  }

  private resolvePointer(event: MouseEvent): { x: number; y: number } {
/** rect：定义该变量以承载业务值。 */
    const rect = this.canvas.getBoundingClientRect();
/** logicalWidth：定义该变量以承载业务值。 */
    const logicalWidth = Math.max(1, this.root.clientWidth);
/** logicalHeight：定义该变量以承载业务值。 */
    const logicalHeight = Math.max(1, this.root.clientHeight);
/** scaleX：定义该变量以承载业务值。 */
    const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
/** scaleY：定义该变量以承载业务值。 */
    const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

/** rebuildScene：执行对应的业务逻辑。 */
  private rebuildScene(): void {
    this.currentNodes = this.generateConstellation();
    this.freezeAnchorDirections();
    this.initParticles();
    this.syncSkillAnchorStates();
    this.positionSkillAnchors();
    this.updateCursor();
  }

/** syncNodeMetadata：执行对应的业务逻辑。 */
  private syncNodeMetadata(): void {
/** byLevel：定义该变量以承载业务值。 */
    const byLevel = new Map(this.state.nodes.map((node) => [node.level, node]));
    this.currentNodes = this.currentNodes.map((node) => {
/** next：定义该变量以承载业务值。 */
      const next = byLevel.get(node.level);
      if (!next) {
        return node;
      }
      return {
        ...node,
        milestone: next.milestone,
        hoverTitle: next.hoverTitle,
        hoverLines: next.hoverLines,
      };
    });
    this.syncSkillAnchorStates();
  }

/** generateConstellation：执行对应的业务逻辑。 */
  private generateConstellation(): InternalNode[] {
/** pathSeed：定义该变量以承载业务值。 */
    const pathSeed = cyrb53(this.state.techniqueName);
/** pathRng：定义该变量以承载业务值。 */
    const pathRng = new PRNG(pathSeed);
/** rawNodes：定义该变量以承载业务值。 */
    const rawNodes: RawNode[] = [];
/** cx：定义该变量以承载业务值。 */
    let cx = 0;
/** cy：定义该变量以承载业务值。 */
    let cy = 0;
/** currentAngle：定义该变量以承载业务值。 */
    let currentAngle = pathRng.nextRange(0, Math.PI * 2);
/** nodes：定义该变量以承载业务值。 */
    const nodes = [...this.state.nodes].sort((left, right) => left.level - right.level);

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeSeed = cyrb53(`${this.state.techniqueName}::level::${node.level}`);
/** nodeRng：定义该变量以承载业务值。 */
      const nodeRng = new PRNG(nodeSeed);
      rawNodes.push({
        index,
        level: node.level,
        name: `第${node.level}层 · ${nodeRng.pick(TECHNIQUE_CONSTELLATION_NODE_NAMES)}`,
        x: cx,
        y: cy,
        baseRadius: node.milestone ? nodeRng.nextRange(8, 11) : nodeRng.nextRange(3.5, 5.5),
        phase: nodeRng.nextRange(0, Math.PI * 2),
        speed: nodeRng.nextRange(0.001, 0.002),
        floatPhaseX: nodeRng.nextRange(0, Math.PI * 2),
        floatPhaseY: nodeRng.nextRange(0, Math.PI * 2),
        floatSpeed: nodeRng.nextRange(0.0004, 0.0012),
        displayX: 0,
        displayY: 0,
        anchorDirX: 1,
        anchorDirY: 0,
        milestone: node.milestone,
        hoverTitle: node.hoverTitle,
        hoverLines: node.hoverLines,
      });

/** turn：定义该变量以承载业务值。 */
      const turn = pathRng.nextRange(-Math.PI / 2.2, Math.PI / 2.2);
      currentAngle += turn;
/** dist：定义该变量以承载业务值。 */
      const dist = pathRng.nextRange(60, node.milestone ? 240 : 130);
      cx += Math.cos(currentAngle) * dist;
      cy += Math.sin(currentAngle) * dist;
    }

/** minX：定义该变量以承载业务值。 */
    let minX = Infinity;
/** maxX：定义该变量以承载业务值。 */
    let maxX = -Infinity;
/** minY：定义该变量以承载业务值。 */
    let minY = Infinity;
/** maxY：定义该变量以承载业务值。 */
    let maxY = -Infinity;
    rawNodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    });

/** shapeWidth：定义该变量以承载业务值。 */
    const shapeWidth = Math.max(1, maxX - minX);
/** shapeHeight：定义该变量以承载业务值。 */
    const shapeHeight = Math.max(1, maxY - minY);
/** canvasWidth：定义该变量以承载业务值。 */
    const canvasWidth = this.root.clientWidth || 1;
/** canvasHeight：定义该变量以承载业务值。 */
    const canvasHeight = this.root.clientHeight || 1;
/** paddingX：定义该变量以承载业务值。 */
    const paddingX = canvasWidth * 0.16;
/** paddingY：定义该变量以承载业务值。 */
    const paddingY = canvasHeight * 0.16;
/** availWidth：定义该变量以承载业务值。 */
    const availWidth = Math.max(1, canvasWidth - paddingX * 2);
/** availHeight：定义该变量以承载业务值。 */
    const availHeight = Math.max(1, canvasHeight - paddingY * 2);
/** maxScale：定义该变量以承载业务值。 */
    const maxScale = 2.2;
/** scale：定义该变量以承载业务值。 */
    const scale = Math.min(availWidth / shapeWidth, availHeight / shapeHeight, maxScale);
/** offsetX：定义该变量以承载业务值。 */
    const offsetX = canvasWidth / 2 - (minX + shapeWidth / 2) * scale;
/** offsetY：定义该变量以承载业务值。 */
    const offsetY = canvasHeight / 2 - (minY + shapeHeight / 2) * scale;

    return rawNodes.map((node) => ({
      ...node,
      x: node.x * scale + offsetX,
      y: node.y * scale + offsetY,
      displayX: node.x * scale + offsetX,
      displayY: node.y * scale + offsetY,
      baseRadius: Math.max(3, node.baseRadius * Math.min(1, scale * 0.8)),
    }));
  }

/** initParticles：执行对应的业务逻辑。 */
  private initParticles(): void {
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, this.root.clientWidth);
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, this.root.clientHeight);
    this.particles = [];
    for (let i = 0; i < 80; i += 1) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.2,
        speedY: (Math.random() - 0.5) * 0.2,
        baseAlpha: Math.random() * 0.3 + 0.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private render = (time: number): void => {
    if (!this.mounted) {
      return;
    }
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, this.root.clientWidth);
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, this.root.clientHeight);
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;

    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, width, height);

    this.particles.forEach((particle) => {
      particle.x += particle.x > width ? -width : (particle.x < 0 ? width : particle.speedX);
      particle.y += particle.y > height ? -height : (particle.y < 0 ? height : particle.speedY);
/** alpha：定义该变量以承载业务值。 */
      const alpha = particle.baseAlpha + Math.sin(time * 0.002 + particle.phase) * 0.1;
      ctx.fillStyle = `rgba(186, 230, 253, ${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

/** magicRadius：定义该变量以承载业务值。 */
    const magicRadius = Math.min(width, height) * 0.45;
    this.drawMagicCircle(width / 2, height / 2, magicRadius, time);

/** floatAmplitude：定义该变量以承载业务值。 */
    const floatAmplitude = 2.5;
    this.currentNodes.forEach((node) => {
      node.displayX = node.x + Math.sin(time * node.floatSpeed + node.floatPhaseX) * floatAmplitude;
      node.displayY = node.y + Math.cos(time * node.floatSpeed + node.floatPhaseY) * floatAmplitude;
    });
    this.positionSkillAnchors();

/** unlockedPath：定义该变量以承载业务值。 */
    const unlockedPath: Array<{
/** displayStart：定义该变量以承载业务值。 */
      displayStart: { x: number; y: number };
/** displayEnd：定义该变量以承载业务值。 */
      displayEnd: { x: number; y: number };
/** stableLength：定义该变量以承载业务值。 */
      stableLength: number;
    }> = [];
/** totalUnlockedLength：定义该变量以承载业务值。 */
    let totalUnlockedLength = 0;
/** fullPathLength：定义该变量以承载业务值。 */
    let fullPathLength = 0;
/** distances：定义该变量以承载业务值。 */
    const distances = [0];
/** progressStartIndex：定义该变量以承载业务值。 */
    const progressStartIndex = this.state.currentLevel - 1;

    for (let i = 0; i < this.currentNodes.length - 1; i += 1) {
      const fromNode = this.currentNodes[i];
      const toNode = this.currentNodes[i + 1];
/** displayStart：定义该变量以承载业务值。 */
      const displayStart = { x: fromNode.displayX, y: fromNode.displayY };
/** displayEnd：定义该变量以承载业务值。 */
      const displayEnd = { x: toNode.displayX, y: toNode.displayY };
/** stableStart：定义该变量以承载业务值。 */
      const stableStart = { x: fromNode.x, y: fromNode.y };
/** stableEnd：定义该变量以承载业务值。 */
      const stableEnd = { x: toNode.x, y: toNode.y };
/** stableDistance：定义该变量以承载业务值。 */
      const stableDistance = Math.hypot(stableEnd.x - stableStart.x, stableEnd.y - stableStart.y);
      fullPathLength += stableDistance;

      if (i < progressStartIndex) {
        unlockedPath.push({
          displayStart,
          displayEnd,
          stableLength: stableDistance,
        });
        totalUnlockedLength += stableDistance;
        distances.push(totalUnlockedLength);
      } else if (i === progressStartIndex && this.state.expPercent > 0 && this.state.currentLevel < this.state.maxLevels) {
/** progressRatio：定义该变量以承载业务值。 */
        const progressRatio = this.state.expPercent / 100;
/** segmentDist：定义该变量以承载业务值。 */
        const segmentDist = stableDistance * progressRatio;
/** partialDisplayEnd：定义该变量以承载业务值。 */
        const partialDisplayEnd = {
          x: displayStart.x + (displayEnd.x - displayStart.x) * progressRatio,
          y: displayStart.y + (displayEnd.y - displayStart.y) * progressRatio,
        };
        unlockedPath.push({
          displayStart,
          displayEnd: partialDisplayEnd,
          stableLength: segmentDist,
        });
        totalUnlockedLength += segmentDist;
        distances.push(totalUnlockedLength);
        break;
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.currentNodes.length - 1; i += 1) {
      const p1 = { x: this.currentNodes[i].displayX, y: this.currentNodes[i].displayY };
      const p2 = { x: this.currentNodes[i + 1].displayX, y: this.currentNodes[i + 1].displayY };

      if (i < progressStartIndex) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0284c7';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 2;
        ctx.shadowColor = '#7dd3fc';
        ctx.stroke();
      } else if (i === progressStartIndex && this.state.expPercent > 0 && this.state.currentLevel < this.state.maxLevels) {
        ctx.beginPath();
        ctx.setLineDash([3, 8]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

/** endX：定义该变量以承载业务值。 */
        const endX = p1.x + (p2.x - p1.x) * (this.state.expPercent / 100);
/** endY：定义该变量以承载业务值。 */
        const endY = p1.y + (p2.y - p1.y) * (this.state.expPercent / 100);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.2)';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#9333ea';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#e879f9';
        ctx.fill();
      }
    }

    if (totalUnlockedLength > 0) {
/** flowSpeed：定义该变量以承载业务值。 */
      const flowSpeed = 0.25;
/** flowPos：定义该变量以承载业务值。 */
      const flowPos = (time * flowSpeed) % (fullPathLength + 600);

      if (flowPos < totalUnlockedLength) {
/** segmentIndex：定义该变量以承载业务值。 */
        let segmentIndex = 0;
        for (let i = 0; i < distances.length - 1; i += 1) {
          if (flowPos >= distances[i] && flowPos < distances[i + 1]) {
            segmentIndex = i;
            break;
          }
        }

/** segment：定义该变量以承载业务值。 */
        const segment = unlockedPath[segmentIndex];
        if (segment) {
/** segmentDistance：定义该变量以承载业务值。 */
          const segmentDistance = Math.max(1, segment.stableLength);
/** progressInSegment：定义该变量以承载业务值。 */
          const progressInSegment = (flowPos - distances[segmentIndex]) / segmentDistance;
/** lx：定义该变量以承载业务值。 */
          const lx = segment.displayStart.x + (segment.displayEnd.x - segment.displayStart.x) * progressInSegment;
/** ly：定义该变量以承载业务值。 */
          const ly = segment.displayStart.y + (segment.displayEnd.y - segment.displayStart.y) * progressInSegment;
/** pulse：定义该变量以承载业务值。 */
          const pulse = 0.72 + 0.28 * Math.sin(time * 0.004);
/** outerRadius：定义该变量以承载业务值。 */
          const outerRadius = 28 * pulse;
/** middleRadius：定义该变量以承载业务值。 */
          const middleRadius = 14 * pulse;
/** outerGlow：定义该变量以承载业务值。 */
          const outerGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, outerRadius);
          outerGlow.addColorStop(0, 'rgba(125, 211, 252, 0.22)');
          outerGlow.addColorStop(0.32, 'rgba(56, 189, 248, 0.14)');
          outerGlow.addColorStop(0.68, 'rgba(14, 165, 233, 0.06)');
          outerGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.beginPath();
          ctx.arc(lx, ly, outerRadius, 0, Math.PI * 2);
          ctx.fillStyle = outerGlow;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(lx, ly, middleRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
          ctx.shadowBlur = 34;
          ctx.shadowColor = '#38bdf8';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(lx, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(224, 242, 254, 0.96)';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#7dd3fc';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
          ctx.fill();
        }
      }
    }

    this.currentNodes.forEach((node) => {
/** isUnlocked：定义该变量以承载业务值。 */
      const isUnlocked = node.level <= this.state.currentLevel;
/** isProgressTarget：定义该变量以承载业务值。 */
      const isProgressTarget = node.level === this.state.currentLevel + 1 && this.state.currentLevel < this.state.maxLevels;
/** isSelected：定义该变量以承载业务值。 */
      const isSelected = node.level === this.state.selectedLevel;
/** alpha：定义该变量以承载业务值。 */
      const alpha = 0.5 + 0.5 * Math.abs(Math.sin(time * node.speed + node.phase));
/** radius：定义该变量以承载业务值。 */
      let radius = node.baseRadius;
/** nx：定义该变量以承载业务值。 */
      const nx = node.displayX;
/** ny：定义该变量以承载业务值。 */
      const ny = node.displayY;

      if (isUnlocked || (isProgressTarget && this.state.expPercent > 0)) {
/** glowRadius：定义该变量以承载业务值。 */
        let glowRadius = node.milestone ? radius * 5 : radius * 3.5;
        if (isProgressTarget) {
          glowRadius *= 1.2;
        }
/** gradient：定义该变量以承载业务值。 */
        const gradient = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowRadius);
        if (node.milestone && isUnlocked) {
          gradient.addColorStop(0, `rgba(253, 224, 71, ${alpha * 0.35})`);
          gradient.addColorStop(0.4, `rgba(217, 119, 6, ${alpha * 0.1})`);
          gradient.addColorStop(1, 'rgba(217, 119, 6, 0)');
        } else if (isProgressTarget) {
          gradient.addColorStop(0, `rgba(232, 121, 249, ${alpha * 0.35})`);
          gradient.addColorStop(0.4, `rgba(168, 85, 247, ${alpha * 0.1})`);
          gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
        } else {
          gradient.addColorStop(0, `rgba(125, 211, 252, ${alpha * 0.35})`);
          gradient.addColorStop(0.4, `rgba(2, 132, 199, ${alpha * 0.1})`);
          gradient.addColorStop(1, 'rgba(2, 132, 199, 0)');
        }
        ctx.beginPath();
        ctx.arc(nx, ny, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      if (isUnlocked) {
        ctx.fillStyle = node.milestone ? 'rgba(254, 240, 138, 0.85)' : 'rgba(186, 230, 253, 0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = node.milestone ? '#f59e0b' : '#38bdf8';
      } else if (isProgressTarget && this.state.expPercent > 0) {
        ctx.fillStyle = 'rgba(233, 213, 255, 0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#c084fc';
        radius *= 1.1;
      } else {
        ctx.fillStyle = `rgba(30, 41, 59, ${alpha * 0.8})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();

      if (isUnlocked || (isProgressTarget && this.state.expPercent > 40)) {
        ctx.beginPath();
        ctx.arc(nx, ny, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ffffff';
        ctx.fill();
      }

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(nx, ny, radius + (node.milestone ? 10 : 7), 0, Math.PI * 2);
        ctx.strokeStyle = node.milestone ? 'rgba(254, 240, 138, 0.92)' : 'rgba(56, 189, 248, 0.92)';
        ctx.lineWidth = 1.4;
        ctx.shadowBlur = 18;
        ctx.shadowColor = node.milestone ? '#fbbf24' : '#38bdf8';
        ctx.stroke();
      }
    });

    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    this.updateSkillReveal(time);
    this.animationFrameId = requestAnimationFrame(this.render);
  };

/** drawMagicCircle：执行对应的业务逻辑。 */
  private drawMagicCircle(cx: number, cy: number, radius: number, time: number): void {
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);

/** c1：定义该变量以承载业务值。 */
    const c1 = 'rgba(56, 189, 248, 0.04)';
/** c2：定义该变量以承载业务值。 */
    const c2 = 'rgba(168, 85, 247, 0.03)';

    ctx.rotate(time * 0.00005);
    ctx.strokeStyle = c1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([15, 20]);
    ctx.arc(0, 0, radius * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.rotate(-time * 0.0001);
    ctx.strokeStyle = c2;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      ctx.lineTo(Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4 + Math.PI / 8;
      ctx.lineTo(Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private handleMouseMove = (event: MouseEvent): void => {
/** pointer：定义该变量以承载业务值。 */
    const pointer = this.resolvePointer(event);
/** mouseX：定义该变量以承载业务值。 */
    const mouseX = pointer.x;
/** mouseY：定义该变量以承载业务值。 */
    const mouseY = pointer.y;
/** hoveredNode：定义该变量以承载业务值。 */
    const hoveredNode = this.findNodeAt(mouseX, mouseY);
/** previousLevel：定义该变量以承载业务值。 */
    const previousLevel = this.hoveredLevel;
    this.hoveredLevel = hoveredNode?.level ?? null;
    this.updateCursor();
    if (!hoveredNode) {
      if (previousLevel !== null) {
        this.onNodeLeave();
      }
      return;
    }
    if (previousLevel !== hoveredNode.level) {
      this.onNodeHover({
        level: hoveredNode.level,
        title: hoveredNode.hoverTitle,
        lines: hoveredNode.hoverLines,
      }, event.clientX, event.clientY);
      return;
    }
    this.onNodeMove(event.clientX, event.clientY);
  };

  private handleMouseLeave = (): void => {
/** hadHover：定义该变量以承载业务值。 */
    const hadHover = this.hoveredLevel !== null;
    this.hoveredLevel = null;
    this.updateCursor();
    if (hadHover) {
      this.onNodeLeave();
    }
  };

  private handleClick = (event: MouseEvent): void => {
/** pointer：定义该变量以承载业务值。 */
    const pointer = this.resolvePointer(event);
/** mouseX：定义该变量以承载业务值。 */
    const mouseX = pointer.x;
/** mouseY：定义该变量以承载业务值。 */
    const mouseY = pointer.y;
/** hitNode：定义该变量以承载业务值。 */
    const hitNode = this.findNodeAt(mouseX, mouseY);
    if (!hitNode) {
      return;
    }
    this.onSelectLevel(hitNode.level);
  };

/** findNodeAt：执行对应的业务逻辑。 */
  private findNodeAt(mouseX: number, mouseY: number): InternalNode | null {
    for (const node of this.currentNodes) {
      const dx = mouseX - node.displayX;
      const dy = mouseY - node.displayY;
/** hitBox：定义该变量以承载业务值。 */
      const hitBox = node.milestone ? 1200 : 700;
      if (dx * dx + dy * dy < hitBox) {
        return node;
      }
    }
    return null;
  }

/** updateCursor：执行对应的业务逻辑。 */
  private updateCursor(): void {
    this.canvas.style.cursor = this.hoveredLevel ? 'pointer' : 'default';
  }

/** collectSkillAnchors：执行对应的业务逻辑。 */
  private collectSkillAnchors(): void {
    this.skillAnchors = this.state.nodes.flatMap((node) => {
/** labels：定义该变量以承载业务值。 */
      const labels = [...this.root.querySelectorAll<HTMLElement>(`[data-tech-skill-anchor-level="${node.level}"]`)]
        .sort((left, right) => Number(left.dataset.techSkillAnchorIndex ?? '0') - Number(right.dataset.techSkillAnchorIndex ?? '0'));
      return labels.map((labelEl) => {
/** index：定义该变量以承载业务值。 */
        const index = Number(labelEl.dataset.techSkillAnchorIndex ?? '0');
        return {
          level: node.level,
          index,
          labelEl,
/** lineEl：定义该变量以承载业务值。 */
          lineEl: this.root.querySelector<SVGPolylineElement>(`[data-tech-skill-line-level="${node.level}"][data-tech-skill-line-index="${index}"]`),
        };
      });
    });
    this.syncSkillAnchorStates();
  }

/** syncSkillAnchorStates：执行对应的业务逻辑。 */
  private syncSkillAnchorStates(): void {
    for (const anchor of this.skillAnchors) {
      const unlocked = anchor.level <= this.state.currentLevel;
      anchor.labelEl.classList.toggle('locked', !unlocked);
      anchor.labelEl.classList.toggle('unlocked', unlocked);
      if (anchor.lineEl) {
        anchor.lineEl.classList.toggle('locked', !unlocked);
        anchor.lineEl.classList.toggle('unlocked', unlocked);
      }
    }
  }

/** positionSkillAnchors：执行对应的业务逻辑。 */
  private positionSkillAnchors(): void {
    if (this.skillAnchors.length === 0) {
      return;
    }
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, this.root.clientWidth);
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, this.root.clientHeight);
/** anchorsByLevel：定义该变量以承载业务值。 */
    const anchorsByLevel = new Map<number, typeof this.skillAnchors>();
    for (const anchor of this.skillAnchors) {
      const current = anchorsByLevel.get(anchor.level) ?? [];
      current.push(anchor);
      anchorsByLevel.set(anchor.level, current);
    }

    for (const node of this.currentNodes) {
      const anchors = anchorsByLevel.get(node.level);
      if (!anchors || anchors.length === 0) {
        continue;
      }
/** anchorDirection：定义该变量以承载业务值。 */
      const anchorDirection = this.normalize({
        x: node.anchorDirX,
        y: node.anchorDirY,
      });
/** spreadDirection：定义该变量以承载业务值。 */
      const spreadDirection = this.normalize({
        x: -anchorDirection.y,
        y: anchorDirection.x,
      });
/** baseOffset：定义该变量以承载业务值。 */
      const baseOffset = (node.milestone ? 62 : 54) + Math.max(0, anchors.length - 1) * 4;
/** stubLength：定义该变量以承载业务值。 */
      const stubLength = node.milestone ? 20 : 16;
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        const labelWidth = anchor.labelEl.offsetWidth || 88;
/** labelHeight：定义该变量以承载业务值。 */
        const labelHeight = anchor.labelEl.offsetHeight || 28;
/** lineInset：定义该变量以承载业务值。 */
        const lineInset = Math.min(12, Math.max(6, Math.min(labelWidth, labelHeight) * 0.28));
/** stackOffset：定义该变量以承载业务值。 */
        const stackOffset = (index - (anchors.length - 1) / 2) * (labelHeight + 10);
/** halfDepth：定义该变量以承载业务值。 */
        const halfDepth = Math.abs(anchorDirection.x) * labelWidth / 2 + Math.abs(anchorDirection.y) * labelHeight / 2;
/** anchorCenter：定义该变量以承载业务值。 */
        const anchorCenter = {
          x: node.displayX + anchorDirection.x * (baseOffset + halfDepth) + spreadDirection.x * stackOffset,
          y: node.displayY + anchorDirection.y * (baseOffset + halfDepth) + spreadDirection.y * stackOffset,
        };
/** left：定义该变量以承载业务值。 */
        const left = Math.max(8, Math.min(anchorCenter.x - labelWidth / 2, width - labelWidth - 8));
/** top：定义该变量以承载业务值。 */
        const top = Math.max(8, Math.min(anchorCenter.y - labelHeight / 2, height - labelHeight - 8));
/** rectCenter：定义该变量以承载业务值。 */
        const rectCenter = {
          x: left + labelWidth / 2,
          y: top + labelHeight / 2,
        };
/** lineEnd：定义该变量以承载业务值。 */
        const lineEnd = {
          x: rectCenter.x - anchorDirection.x * Math.max(0, halfDepth - lineInset),
          y: rectCenter.y - anchorDirection.y * Math.max(0, halfDepth - lineInset),
        };
/** firstBend：定义该变量以承载业务值。 */
        const firstBend = {
          x: node.displayX + anchorDirection.x * stubLength,
          y: node.displayY + anchorDirection.y * stubLength,
        };
/** deltaToEnd：定义该变量以承载业务值。 */
        const deltaToEnd = {
          x: lineEnd.x - firstBend.x,
          y: lineEnd.y - firstBend.y,
        };
/** sideDistance：定义该变量以承载业务值。 */
        const sideDistance = deltaToEnd.x * spreadDirection.x + deltaToEnd.y * spreadDirection.y;
/** outDistance：定义该变量以承载业务值。 */
        const outDistance = deltaToEnd.x * anchorDirection.x + deltaToEnd.y * anchorDirection.y;
/** secondBend：定义该变量以承载业务值。 */
        const secondBend = {
          x: firstBend.x + spreadDirection.x * sideDistance,
          y: firstBend.y + spreadDirection.y * sideDistance,
        };
/** thirdBend：定义该变量以承载业务值。 */
        const thirdBend = {
          x: secondBend.x + anchorDirection.x * Math.max(0, outDistance - 6),
          y: secondBend.y + anchorDirection.y * Math.max(0, outDistance - 6),
        };
        anchor.labelEl.style.transform = `translate(${left}px, ${top}px)`;
        anchor.labelEl.style.transformOrigin = `${anchorDirection.x >= 0 ? 'left' : 'right'} center`;
        if (anchor.lineEl) {
          anchor.lineEl.setAttribute('points', [
            `${node.displayX.toFixed(2)},${node.displayY.toFixed(2)}`,
            `${firstBend.x.toFixed(2)},${firstBend.y.toFixed(2)}`,
            `${secondBend.x.toFixed(2)},${secondBend.y.toFixed(2)}`,
            `${thirdBend.x.toFixed(2)},${thirdBend.y.toFixed(2)}`,
            `${lineEnd.x.toFixed(2)},${lineEnd.y.toFixed(2)}`,
          ].join(' '));
        }
      }
    }
  }

/** freezeAnchorDirections：执行对应的业务逻辑。 */
  private freezeAnchorDirections(): void {
/** center：定义该变量以承载业务值。 */
    const center = {
      x: Math.max(1, this.root.clientWidth) / 2,
      y: Math.max(1, this.root.clientHeight) / 2,
    };
    this.currentNodes = this.currentNodes.map((node) => {
/** direction：定义该变量以承载业务值。 */
      const direction = this.resolveAnchorDirection(node, center);
      return {
        ...node,
        anchorDirX: direction.x,
        anchorDirY: direction.y,
      };
    });
  }

  private resolveAnchorDirection(node: InternalNode, center: { x: number; y: number }): { x: number; y: number } {
/** prev：定义该变量以承载业务值。 */
    const prev = this.currentNodes[node.index - 1] ?? null;
/** next：定义该变量以承载业务值。 */
    const next = this.currentNodes[node.index + 1] ?? null;
/** neighborVectors：定义该变量以承载业务值。 */
    const neighborVectors = [prev, next]
      .filter((entry): entry is InternalNode => entry !== null)
      .map((entry) => this.normalize({
        x: entry.x - node.x,
        y: entry.y - node.y,
      }))
      .filter((entry) => this.length(entry) > 0);
/** crowd：定义该变量以承载业务值。 */
    const crowd = neighborVectors.reduce((sum, entry) => ({
      x: sum.x + entry.x,
      y: sum.y + entry.y,
    }), { x: 0, y: 0 });
/** awayFromCrowd：定义该变量以承载业务值。 */
    const awayFromCrowd = this.normalize({ x: -crowd.x, y: -crowd.y });
/** centerBias：定义该变量以承载业务值。 */
    const centerBias = this.normalize({
      x: node.displayX - center.x,
      y: node.displayY - center.y,
    });

/** tangent：定义该变量以承载业务值。 */
    let tangent = { x: 0, y: 0 };
    if (prev && next) {
      tangent = this.normalize({
        x: next.x - prev.x,
        y: next.y - prev.y,
      });
    } else if (next) {
      tangent = this.normalize({
        x: next.x - node.x,
        y: next.y - node.y,
      });
    } else if (prev) {
      tangent = this.normalize({
        x: node.x - prev.x,
        y: node.y - prev.y,
      });
    }

/** normalA：定义该变量以承载业务值。 */
    const normalA = this.normalize({ x: -tangent.y, y: tangent.x });
/** normalB：定义该变量以承载业务值。 */
    const normalB = this.normalize({ x: tangent.y, y: -tangent.x });
/** preferred：定义该变量以承载业务值。 */
    const preferred = this.normalize({
      x: awayFromCrowd.x * 0.78 + centerBias.x * 0.22,
      y: awayFromCrowd.y * 0.78 + centerBias.y * 0.22,
    });

/** chosen：定义该变量以承载业务值。 */
    let chosen = preferred;
    if (this.length(tangent) > 0) {
/** scoreA：定义该变量以承载业务值。 */
      const scoreA = this.dot(normalA, preferred);
/** scoreB：定义该变量以承载业务值。 */
      const scoreB = this.dot(normalB, preferred);
/** baseNormal：定义该变量以承载业务值。 */
      const baseNormal = scoreA >= scoreB ? normalA : normalB;
      chosen = this.normalize({
        x: baseNormal.x * 0.72 + preferred.x * 0.28,
        y: baseNormal.y * 0.72 + preferred.y * 0.28,
      });
    }

    if (this.length(chosen) === 0) {
      return { x: 1, y: 0 };
    }
    return chosen;
  }

/** updateSkillReveal：执行对应的业务逻辑。 */
  private updateSkillReveal(time: number): void {
/** totalLevels：定义该变量以承载业务值。 */
    const totalLevels = Math.max(1, this.state.maxLevels);
/** progress：定义该变量以承载业务值。 */
    const progress = Math.max(0, Math.min(1, (time - this.openedAt) / 1100));
/** revealWindow：定义该变量以承载业务值。 */
    const revealWindow = 0.16;
/** revealSpan：定义该变量以承载业务值。 */
    const revealSpan = Math.max(0, 1 - revealWindow);
    for (const anchor of this.skillAnchors) {
      const levelRatio = totalLevels <= 1 ? 0 : (anchor.level - 1) / (totalLevels - 1);
      const threshold = levelRatio * revealSpan;
/** local：定义该变量以承载业务值。 */
      const local = Math.max(0, Math.min(1, (progress - threshold) / revealWindow));
/** eased：定义该变量以承载业务值。 */
      const eased = local * local * (3 - 2 * local);
      anchor.labelEl.style.opacity = eased.toFixed(3);
      if (anchor.lineEl) {
        anchor.lineEl.style.opacity = eased.toFixed(3);
      }
    }
  }

/** length：执行对应的业务逻辑。 */
  private length(vector: { x: number; y: number }): number {
    return Math.hypot(vector.x, vector.y);
  }

  private normalize(vector: { x: number; y: number }): { x: number; y: number } {
/** size：定义该变量以承载业务值。 */
    const size = this.length(vector);
    if (size <= 1e-6) {
      return { x: 0, y: 0 };
    }
    return {
      x: vector.x / size,
      y: vector.y / size,
    };
  }

/** dot：执行对应的业务逻辑。 */
  private dot(left: { x: number; y: number }, right: { x: number; y: number }): number {
    return left.x * right.x + left.y * right.y;
  }

/** escapeHtml：执行对应的业务逻辑。 */
  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

