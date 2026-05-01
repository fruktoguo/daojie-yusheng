import { TECHNIQUE_CONSTELLATION_NODE_NAMES } from '../../constants/ui/technique-constellation';

/** TechniqueConstellationMilestone：星图节点的阶段里程碑标记。 */
type TechniqueConstellationMilestone = '小成' | '大成' | '圆满';

/** TechniqueConstellationNode：功法星图节点的展示数据。 */
type TechniqueConstellationNode = {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * milestone：milestone相关字段。
 */

  milestone?: TechniqueConstellationMilestone;  
  /**
 * hoverTitle：hoverTitle名称或显示文本。
 */

  hoverTitle: string;  
  /**
 * hoverLines：hoverLine相关字段。
 */

  hoverLines: string[];
};

/** TechniqueConstellationCanvasData：功法星图画布的输入状态。 */
export type TechniqueConstellationCanvasData = {
/**
 * techniqueName：功法名称名称或显示文本。
 */

  techniqueName: string;  
  /**
 * maxLevels：max等级相关字段。
 */

  maxLevels: number;  
  /**
 * currentLevel：current等级数值。
 */

  currentLevel: number;  
  /**
 * expPercent：expPercent相关字段。
 */

  expPercent: number;  
  /**
 * selectedLevel：selected等级数值。
 */

  selectedLevel: number;  
  /**
 * nodes：node相关字段。
 */

  nodes: TechniqueConstellationNode[];
};

/** TechniqueConstellationHoverPayload：星图节点悬浮提示载荷。 */
export type TechniqueConstellationHoverPayload = {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * lines：line相关字段。
 */

  lines: string[];
};

/** InternalNode：星图节点的内部布局与动效数据。 */
type InternalNode = TechniqueConstellationNode & {
/**
 * index：index相关字段。
 */

  index: number;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * displayX：显示X相关字段。
 */

  displayX: number;  
  /**
 * displayY：显示Y相关字段。
 */

  displayY: number;  
  /**
 * baseRadius：baseRadiu相关字段。
 */

  baseRadius: number;  
  /**
 * phase：phase相关字段。
 */

  phase: number;  
  /**
 * speed：speed数值。
 */

  speed: number;  
  /**
 * floatPhaseX：floatPhaseX相关字段。
 */

  floatPhaseX: number;  
  /**
 * floatPhaseY：floatPhaseY相关字段。
 */

  floatPhaseY: number;  
  /**
 * floatSpeed：floatSpeed数值。
 */

  floatSpeed: number;  
  /**
 * anchorDirX：anchorDirX相关字段。
 */

  anchorDirX: number;  
  /**
 * anchorDirY：anchorDirY相关字段。
 */

  anchorDirY: number;
};

/** RawNode：星图节点生成过程中的原始布局数据。 */
type RawNode = InternalNode;

/** Particle：星图背景粒子的动画状态。 */
type Particle = {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * size：数量或计量字段。
 */

  size: number;  
  /**
 * speedX：speedX相关字段。
 */

  speedX: number;  
  /**
 * speedY：speedY相关字段。
 */

  speedY: number;  
  /**
 * baseAlpha：baseAlpha相关字段。
 */

  baseAlpha: number;  
  /**
 * phase：phase相关字段。
 */

  phase: number;
};

const cyrb53 = (str: string, seed = 0): number => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    /** h1：h1。 */
    h1 = Math.imul(h1 ^ ch, 2654435761);
    /** h2：h2。 */
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  /** h1：h1。 */
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  /** h2：h2。 */
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/** PRNG：PRNG实现。 */
class PRNG {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param seed number 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(private seed: number) {}

  /** next：处理新版。 */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** nextRange：处理新版Range。 */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** nextInt：处理新版整数。 */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }

  /** pick：处理pick。 */
  pick<T>(array: readonly T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

/** TechniqueConstellationCanvas：Technique星图Canvas实现。 */
export class TechniqueConstellationCanvas {
  /** canvas：canvas。 */
  private canvas: HTMLCanvasElement;
  /** ctx：ctx。 */
  private ctx: CanvasRenderingContext2D;
  /** skillLines：技能Lines。 */
  private skillLines: SVGSVGElement | null;  
  /**
 * skillAnchors：技能Anchor相关字段。
 */

  private skillAnchors: Array<{  
  /**
 * level：等级数值。
 */

    level: number;    
    /**
 * index：index相关字段。
 */

    index: number;    
    /**
 * labelEl：labelEl相关字段。
 */

    labelEl: HTMLElement;    
    /**
 * lineEl：lineEl相关字段。
 */

    lineEl: SVGPolylineElement | null;
  }> = [];
  /** resizeObserver：resize观察。 */
  private resizeObserver: ResizeObserver | null = null;
  /** animationFrameId：animation帧ID。 */
  private animationFrameId = 0;
  /** particles：particles。 */
  private particles: Particle[] = [];
  /** currentNodes：当前Nodes。 */
  private currentNodes: InternalNode[] = [];
  /** pixelWidth：pixel Width。 */
  private pixelWidth = 0;
  /** pixelHeight：pixel Height。 */
  private pixelHeight = 0;
  /** hoveredLevel：hovered等级。 */
  private hoveredLevel: number | null = null;
  /** mounted：mounted。 */
  private mounted = false;
  /** openedAt：opened At。 */
  private openedAt = 0;
  /** state：状态。 */
  private state: TechniqueConstellationCanvasData;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param root HTMLElement 参数说明。
 * @param initialState TechniqueConstellationCanvasData 参数说明。
 * @param onSelectLevel (level: number) => void 参数说明。
 * @param onNodeHover (payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number) => void 参数说明。
 * @param onNodeMove (clientX: number, clientY: number) => void 参数说明。
 * @param onNodeLeave () => void 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    private root: HTMLElement,
    initialState: TechniqueConstellationCanvasData,
    private readonly onSelectLevel: (level: number) => void,
    private readonly onNodeHover: (payload: TechniqueConstellationHoverPayload, clientX: number, clientY: number) => void,
    private readonly onNodeMove: (clientX: number, clientY: number) => void,
    private readonly onNodeLeave: () => void,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const canvas = root.querySelector<HTMLCanvasElement>('[data-tech-starfield-canvas="true"]');
    if (!canvas) {
      throw new Error('功法星图画布根节点不完整。');
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('无法获取功法星图画布的 2D 上下文。');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.skillLines = root.querySelector<SVGSVGElement>('[data-tech-starfield-skill-lines="true"]');
    this.state = initialState;
    this.mount();
  }

  /** update：更新更新。 */
  update(nextState: TechniqueConstellationCanvasData): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shouldRebuildNodes = this.state.techniqueName !== nextState.techniqueName || this.state.maxLevels !== nextState.maxLevels;
    this.state = nextState;
    if (shouldRebuildNodes) {
      this.rebuildScene();
      return;
    }
    this.syncNodeMetadata();
    this.updateCursor();
  }

  /** destroy：处理destroy。 */
  destroy(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** mount：处理mount。 */
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

  /** resizeAndRebuild：处理resize And Rebuild。 */
  private resizeAndRebuild(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const cssWidth = Math.max(1, Math.floor(this.root.clientWidth));
    const cssHeight = Math.max(1, Math.floor(this.root.clientHeight));
    const bounds = this.root.getBoundingClientRect();
    const viewportScaleX = cssWidth > 0 && bounds.width > 0 ? bounds.width / cssWidth : 1;
    const viewportScaleY = cssHeight > 0 && bounds.height > 0 ? bounds.height / cssHeight : 1;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const pixelRatioX = dpr * viewportScaleX;
    const pixelRatioY = dpr * viewportScaleY;
    const nextWidth = Math.max(1, Math.floor(cssWidth * pixelRatioX));
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

  /** resolvePointer：解析Pointer。 */
  private resolvePointer(event: MouseEvent): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const logicalWidth = Math.max(1, this.root.clientWidth);
    const logicalHeight = Math.max(1, this.root.clientHeight);
    const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  /** rebuildScene：处理rebuild场景。 */
  private rebuildScene(): void {
    this.currentNodes = this.generateConstellation();
    this.freezeAnchorDirections();
    this.initParticles();
    this.syncSkillAnchorStates();
    this.positionSkillAnchors();
    this.updateCursor();
  }

  /** syncNodeMetadata：同步节点Metadata。 */
  private syncNodeMetadata(): void {
    const byLevel = new Map(this.state.nodes.map((node) => [node.level, node]));
    this.currentNodes = this.currentNodes.map((node) => {
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

  /** generateConstellation：处理generate星图。 */
  private generateConstellation(): InternalNode[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const pathSeed = cyrb53(this.state.techniqueName);
    const pathRng = new PRNG(pathSeed);
    const rawNodes: RawNode[] = [];
    let cx = 0;
    let cy = 0;
    let currentAngle = pathRng.nextRange(0, Math.PI * 2);
    const nodes = [...this.state.nodes].sort((left, right) => left.level - right.level);

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodeSeed = cyrb53(`${this.state.techniqueName}::level::${node.level}`);
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

      const turn = pathRng.nextRange(-Math.PI / 2.2, Math.PI / 2.2);
      currentAngle += turn;
      const dist = pathRng.nextRange(60, node.milestone ? 240 : 130);
      cx += Math.cos(currentAngle) * dist;
      cy += Math.sin(currentAngle) * dist;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    rawNodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    });

    const shapeWidth = Math.max(1, maxX - minX);
    const shapeHeight = Math.max(1, maxY - minY);
    const canvasWidth = this.root.clientWidth || 1;
    const canvasHeight = this.root.clientHeight || 1;
    const paddingX = canvasWidth * 0.16;
    const paddingY = canvasHeight * 0.16;
    const availWidth = Math.max(1, canvasWidth - paddingX * 2);
    const availHeight = Math.max(1, canvasHeight - paddingY * 2);
    const maxScale = 2.2;
    const scale = Math.min(availWidth / shapeWidth, availHeight / shapeHeight, maxScale);
    const offsetX = canvasWidth / 2 - (minX + shapeWidth / 2) * scale;
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

  /** initParticles：初始化Particles。 */
  private initParticles(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const width = Math.max(1, this.root.clientWidth);
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
  /**
 * render：render相关字段。
 */


  private render = (time: number): void => {
    if (!this.mounted) {
      return;
    }
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    const ctx = this.ctx;

    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, width, height);

    this.particles.forEach((particle) => {
      particle.x += particle.x > width ? -width : (particle.x < 0 ? width : particle.speedX);
      particle.y += particle.y > height ? -height : (particle.y < 0 ? height : particle.speedY);
      const alpha = particle.baseAlpha + Math.sin(time * 0.002 + particle.phase) * 0.1;
      ctx.fillStyle = `rgba(186, 230, 253, ${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    const magicRadius = Math.min(width, height) * 0.45;
    this.drawMagicCircle(width / 2, height / 2, magicRadius, time);

    const floatAmplitude = 2.5;
    this.currentNodes.forEach((node) => {
      node.displayX = node.x + Math.sin(time * node.floatSpeed + node.floatPhaseX) * floatAmplitude;
      node.displayY = node.y + Math.cos(time * node.floatSpeed + node.floatPhaseY) * floatAmplitude;
    });
    this.positionSkillAnchors();

    const unlockedPath: Array<{    
    /**
 * displayStart：显示Start相关字段。
 */

      displayStart: {      
      /**
 * x：x相关字段。
 */
 x: number;      
 /**
 * y：y相关字段。
 */
 y: number };      
 /**
 * displayEnd：显示End相关字段。
 */

      displayEnd: {      
      /**
 * x：x相关字段。
 */
 x: number;      
 /**
 * y：y相关字段。
 */
 y: number };      
 /**
 * stableLength：数量或计量字段。
 */

      stableLength: number;
    }> = [];
    let totalUnlockedLength = 0;
    let fullPathLength = 0;
    const distances = [0];
    const progressStartIndex = this.state.currentLevel - 1;

    for (let i = 0; i < this.currentNodes.length - 1; i += 1) {
      const fromNode = this.currentNodes[i];
      const toNode = this.currentNodes[i + 1];
      const displayStart = { x: fromNode.displayX, y: fromNode.displayY };
      const displayEnd = { x: toNode.displayX, y: toNode.displayY };
      const stableStart = { x: fromNode.x, y: fromNode.y };
      const stableEnd = { x: toNode.x, y: toNode.y };
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
        const progressRatio = this.state.expPercent / 100;
        const segmentDist = stableDistance * progressRatio;
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

        const endX = p1.x + (p2.x - p1.x) * (this.state.expPercent / 100);
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
      const flowSpeed = 0.25;
      const flowPos = (time * flowSpeed) % (fullPathLength + 600);

      if (flowPos < totalUnlockedLength) {
        let segmentIndex = 0;
        for (let i = 0; i < distances.length - 1; i += 1) {
          if (flowPos >= distances[i] && flowPos < distances[i + 1]) {
            segmentIndex = i;
            break;
          }
        }

        const segment = unlockedPath[segmentIndex];
        if (segment) {
          const segmentDistance = Math.max(1, segment.stableLength);
          const progressInSegment = (flowPos - distances[segmentIndex]) / segmentDistance;
          const lx = segment.displayStart.x + (segment.displayEnd.x - segment.displayStart.x) * progressInSegment;
          const ly = segment.displayStart.y + (segment.displayEnd.y - segment.displayStart.y) * progressInSegment;
          const pulse = 0.72 + 0.28 * Math.sin(time * 0.004);
          const outerRadius = 28 * pulse;
          const middleRadius = 14 * pulse;
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
      const isUnlocked = node.level <= this.state.currentLevel;
      const isProgressTarget = node.level === this.state.currentLevel + 1 && this.state.currentLevel < this.state.maxLevels;
      const isSelected = node.level === this.state.selectedLevel;
      const alpha = 0.5 + 0.5 * Math.abs(Math.sin(time * node.speed + node.phase));
      let radius = node.baseRadius;
      const nx = node.displayX;
      const ny = node.displayY;

      if (isUnlocked || (isProgressTarget && this.state.expPercent > 0)) {
        let glowRadius = node.milestone ? radius * 5 : radius * 3.5;
        if (isProgressTarget) {
          glowRadius *= 1.2;
        }
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

  /** drawMagicCircle：处理draw Magic Circle。 */
  private drawMagicCircle(cx: number, cy: number, radius: number, time: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);

    const c1 = 'rgba(56, 189, 248, 0.04)';
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
  /**
 * handleMouseMove：handleMouseMove相关字段。
 */


  private handleMouseMove = (event: MouseEvent): void => {
    const pointer = this.resolvePointer(event);
    const mouseX = pointer.x;
    const mouseY = pointer.y;
    const hoveredNode = this.findNodeAt(mouseX, mouseY);
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
  /**
 * handleMouseLeave：handleMouseLeave相关字段。
 */


  private handleMouseLeave = (): void => {
    const hadHover = this.hoveredLevel !== null;
    this.hoveredLevel = null;
    this.updateCursor();
    if (hadHover) {
      this.onNodeLeave();
    }
  };  
  /**
 * handleClick：handleClick相关字段。
 */


  private handleClick = (event: MouseEvent): void => {
    const pointer = this.resolvePointer(event);
    const mouseX = pointer.x;
    const mouseY = pointer.y;
    const hitNode = this.findNodeAt(mouseX, mouseY);
    if (!hitNode) {
      return;
    }
    this.onSelectLevel(hitNode.level);
  };

  /** findNodeAt：查找节点At。 */
  private findNodeAt(mouseX: number, mouseY: number): InternalNode | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const node of this.currentNodes) {
      const dx = mouseX - node.displayX;
      const dy = mouseY - node.displayY;
      const hitBox = node.milestone ? 1200 : 700;
      if (dx * dx + dy * dy < hitBox) {
        return node;
      }
    }
    return null;
  }

  /** updateCursor：更新Cursor。 */
  private updateCursor(): void {
    this.canvas.style.cursor = this.hoveredLevel ? 'pointer' : 'default';
  }

  /** collectSkillAnchors：收集技能Anchors。 */
  private collectSkillAnchors(): void {
    this.skillAnchors = this.state.nodes.flatMap((node) => {
      const labels = [...this.root.querySelectorAll<HTMLElement>(`[data-tech-skill-anchor-level="${node.level}"]`)]
        .sort((left, right) => Number(left.dataset.techSkillAnchorIndex ?? '0') - Number(right.dataset.techSkillAnchorIndex ?? '0'));
      return labels.map((labelEl) => {
        const index = Number(labelEl.dataset.techSkillAnchorIndex ?? '0');
        return {
          level: node.level,
          index,
          labelEl,
          lineEl: this.root.querySelector<SVGPolylineElement>(`[data-tech-skill-line-level="${node.level}"][data-tech-skill-line-index="${index}"]`),
        };
      });
    });
    this.syncSkillAnchorStates();
  }

  /** syncSkillAnchorStates：同步技能Anchor States。 */
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

  /** positionSkillAnchors：处理位置技能Anchors。 */
  private positionSkillAnchors(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.skillAnchors.length === 0) {
      return;
    }
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
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
      const anchorDirection = this.normalize({
        x: node.anchorDirX,
        y: node.anchorDirY,
      });
      const spreadDirection = this.normalize({
        x: -anchorDirection.y,
        y: anchorDirection.x,
      });
      const baseOffset = (node.milestone ? 62 : 54) + Math.max(0, anchors.length - 1) * 4;
      const stubLength = node.milestone ? 20 : 16;
      for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        const labelWidth = anchor.labelEl.offsetWidth || 88;
        const labelHeight = anchor.labelEl.offsetHeight || 28;
        const lineInset = Math.min(12, Math.max(6, Math.min(labelWidth, labelHeight) * 0.28));
        const stackOffset = (index - (anchors.length - 1) / 2) * (labelHeight + 10);
        const halfDepth = Math.abs(anchorDirection.x) * labelWidth / 2 + Math.abs(anchorDirection.y) * labelHeight / 2;
        const anchorCenter = {
          x: node.displayX + anchorDirection.x * (baseOffset + halfDepth) + spreadDirection.x * stackOffset,
          y: node.displayY + anchorDirection.y * (baseOffset + halfDepth) + spreadDirection.y * stackOffset,
        };
        const left = Math.max(8, Math.min(anchorCenter.x - labelWidth / 2, width - labelWidth - 8));
        const top = Math.max(8, Math.min(anchorCenter.y - labelHeight / 2, height - labelHeight - 8));
        const rectCenter = {
          x: left + labelWidth / 2,
          y: top + labelHeight / 2,
        };
        const lineEnd = {
          x: rectCenter.x - anchorDirection.x * Math.max(0, halfDepth - lineInset),
          y: rectCenter.y - anchorDirection.y * Math.max(0, halfDepth - lineInset),
        };
        const firstBend = {
          x: node.displayX + anchorDirection.x * stubLength,
          y: node.displayY + anchorDirection.y * stubLength,
        };
        const deltaToEnd = {
          x: lineEnd.x - firstBend.x,
          y: lineEnd.y - firstBend.y,
        };
        const sideDistance = deltaToEnd.x * spreadDirection.x + deltaToEnd.y * spreadDirection.y;
        const outDistance = deltaToEnd.x * anchorDirection.x + deltaToEnd.y * anchorDirection.y;
        const secondBend = {
          x: firstBend.x + spreadDirection.x * sideDistance,
          y: firstBend.y + spreadDirection.y * sideDistance,
        };
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

  /** freezeAnchorDirections：处理freeze Anchor方向。 */
  private freezeAnchorDirections(): void {
    const center = {
      x: Math.max(1, this.root.clientWidth) / 2,
      y: Math.max(1, this.root.clientHeight) / 2,
    };
    this.currentNodes = this.currentNodes.map((node) => {
      const direction = this.resolveAnchorDirection(node, center);
      return {
        ...node,
        anchorDirX: direction.x,
        anchorDirY: direction.y,
      };
    });
  }

  /** resolveAnchorDirection：解析Anchor方向。 */
  private resolveAnchorDirection(node: InternalNode, center: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }): {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const prev = this.currentNodes[node.index - 1] ?? null;
    const next = this.currentNodes[node.index + 1] ?? null;
    const neighborVectors = [prev, next]
      .filter((entry): entry is InternalNode => entry !== null)
      .map((entry) => this.normalize({
        x: entry.x - node.x,
        y: entry.y - node.y,
      }))
      .filter((entry) => this.length(entry) > 0);
    const crowd = neighborVectors.reduce((sum, entry) => ({
      x: sum.x + entry.x,
      y: sum.y + entry.y,
    }), { x: 0, y: 0 });
    const awayFromCrowd = this.normalize({ x: -crowd.x, y: -crowd.y });
    const centerBias = this.normalize({
      x: node.displayX - center.x,
      y: node.displayY - center.y,
    });

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

    const normalA = this.normalize({ x: -tangent.y, y: tangent.x });
    const normalB = this.normalize({ x: tangent.y, y: -tangent.x });
    const preferred = this.normalize({
      x: awayFromCrowd.x * 0.78 + centerBias.x * 0.22,
      y: awayFromCrowd.y * 0.78 + centerBias.y * 0.22,
    });

    let chosen = preferred;
    if (this.length(tangent) > 0) {
      const scoreA = this.dot(normalA, preferred);
      const scoreB = this.dot(normalB, preferred);
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

  /** updateSkillReveal：更新技能Reveal。 */
  private updateSkillReveal(time: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const totalLevels = Math.max(1, this.state.maxLevels);
    const progress = Math.max(0, Math.min(1, (time - this.openedAt) / 1100));
    const revealWindow = 0.16;
    const revealSpan = Math.max(0, 1 - revealWindow);
    for (const anchor of this.skillAnchors) {
      const levelRatio = totalLevels <= 1 ? 0 : (anchor.level - 1) / (totalLevels - 1);
      const threshold = levelRatio * revealSpan;
      const local = Math.max(0, Math.min(1, (progress - threshold) / revealWindow));
      const eased = local * local * (3 - 2 * local);
      anchor.labelEl.style.opacity = eased.toFixed(3);
      if (anchor.lineEl) {
        anchor.lineEl.style.opacity = eased.toFixed(3);
      }
    }
  }

  /** length：处理length。 */
  private length(vector: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }): number {
    return Math.hypot(vector.x, vector.y);
  }

  /** normalize：规范化normalize。 */
  private normalize(vector: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }): {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const size = this.length(vector);
    if (size <= 1e-6) {
      return { x: 0, y: 0 };
    }
    return {
      x: vector.x / size,
      y: vector.y / size,
    };
  }

  /** dot：处理dot。 */
  private dot(left: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }, right: {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }): number {
    return left.x * right.x + left.y * right.y;
  }

  /** escapeHtml：转义 HTML 文本中的危险字符。 */
  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

