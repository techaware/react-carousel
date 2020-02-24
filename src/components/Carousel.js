/* eslint-disable react/no-unused-prop-types */ // we disable propTypes usage checking as we use getProp function
/* eslint react/no-deprecated: 0 */ // TODO: update componentWillReceiveProps compononent to use static getDerivedStateFromProps instead
import React, { Component } from 'react';
import throttle from 'lodash/throttle';
import isNil from 'lodash/isNil';
import has from 'lodash/has';
import concat from 'lodash/concat';
import times from 'lodash/times';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import config from '../constants/config';

import CarouselItem from './CarouselItem';
import Dots from './CarouselDots';
import '../styles/Carousel.scss';
import '../styles/Arrows.scss';

export default class Carousel extends Component {
  static propTypes = {
    value: PropTypes.number,
    valueY: PropTypes.number,
    onChange: PropTypes.func,
    children: PropTypes.node,
    slides: PropTypes.arrayOf(PropTypes.node),
    slidesPerPage: PropTypes.number,
    slidesPerScroll: PropTypes.number,
    itemWidth: PropTypes.number,
    itemHeight: PropTypes.number,
    offset: PropTypes.number,
    arrows: PropTypes.bool,
    arrowLeft: PropTypes.element,
    arrowRight: PropTypes.element,
    addArrowClickHandler: PropTypes.bool,
    autoPlay: PropTypes.number,
    stopAutoPlayOnHover: PropTypes.bool,
    clickToChange: PropTypes.bool,
    centered: PropTypes.bool,
    infinite: PropTypes.bool,
    draggable: PropTypes.bool,
    keepDirectionWhenDragging: PropTypes.bool,
    animationSpeed: PropTypes.number,
    dots: PropTypes.bool,
    className: PropTypes.string,
    minDraggableOffset: PropTypes.number,
    rowCount: PropTypes.number,
    breakpoints: PropTypes.objectOf(PropTypes.shape({
      slidesPerPage: PropTypes.number,
      slidesPerScroll: PropTypes.number,
      arrows: PropTypes.bool,
      arrowLeft: PropTypes.element,
      arrowRight: PropTypes.element,
      addArrowClickHandler: PropTypes.bool,
      autoPlay: PropTypes.number,
      stopAutoPlayOnHover: PropTypes.bool,
      clickToChange: PropTypes.bool,
      centered: PropTypes.bool,
      infinite: PropTypes.bool,
      draggable: PropTypes.bool,
      keepDirectionWhenDragging: PropTypes.bool,
      animationSpeed: PropTypes.number,
      dots: PropTypes.bool,
      className: PropTypes.string,
    })),
  };
  static defaultProps = {
    value: 0,
    valueY: 1,
    offset: 0,
    slidesPerPage: 1,
    slidesPerScroll: 1,
    animationSpeed: 500,
    draggable: true,
    minDraggableOffset: 10,
    rowCount: 1,
  };

  constructor(props) {
    super(props);
    this.state = {
      carouselWidth: 0,
      carouselHeight: 0,
      windowWidth: 0,
      windowHeight: 0,
      clicked: null,
      dragOffset: 0,
      dragOffsetY: 0,
      dragStart: null,
      dragStartY: null,
      transitionEnabled: false,
      infiniteTransitionFrom: null, // indicates what slide we are transitioning from (in case of infinite carousel), contains number value or null
      isAutoPlayStopped: false,
    };
    this.interval = null;
  }


  /* ========== initial handlers and positioning setup ========== */
  componentDidMount() {
    // adding listener to remove transition when animation finished
    this.trackRef && this.trackRef.addEventListener('transitionend', this.onTransitionEnd);

    // adding event listeners for swipe
    if (this.node) {
      this.node.parentElement.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('mouseup', this.onMouseUpTouchEnd, true);
      this.node.parentElement.addEventListener('touchstart', this.simulateEvent, true);
      this.node.parentElement.addEventListener('touchmove', this.simulateEvent, { passive: false });
      this.node.parentElement.addEventListener('touchend', this.simulateEvent, true);
    }

    // setting size of a carousel in state
    window.addEventListener('resize', this.onResize);
    this.onResize();

    // setting size of a carousel in state based on styling
    window.addEventListener('load', this.onResize);

    // setting autoplay interval
    this.resetInterval();
  }

  componentWillReceiveProps(nextProps) {
    const valueChanged = this.checkIfValueChanged(nextProps);

    if (this.state.transitionEnabled) {
      return this.setState(previousState => ({
        transitionEnabled: valueChanged ? true : previousState.transitionEnabled,
      }));
    }
    this.setState(previousState => ({
      infiniteTransitionFrom: this.getCurrentValue(),
      transitionEnabled: valueChanged ? true : previousState.transitionEnabled,
    }));
  }

  componentDidUpdate(prevProps) {
    const valueChanged = this.checkIfValueChanged(prevProps);
    if (this.getProp('autoPlay') !== this.getProp('autoPlay', prevProps) || valueChanged) {
      this.resetInterval();
    }
  }

  componentWillUnmount() {
    this.trackRef && this.trackRef.removeEventListener('transitionend', this.onTransitionEnd);

    if (this.node) {
      this.node.parentElement.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUpTouchEnd);
      this.node.parentElement.removeEventListener('touchstart', this.simulateEvent);
      this.node.parentElement.removeEventListener('touchmove', this.simulateEvent);
      this.node.parentElement.removeEventListener('touchend', this.simulateEvent);
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('load', this.onResize);
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  /* ========== tools ========== */
  getCurrentValue = () => this.props.value;

  getCurrentValueY = () => this.props.valueY;

  getNeededAdditionalClones = () =>
    Math.ceil((this.getCurrentValue() - this.state.infiniteTransitionFrom) / this.getChildren().length);

  getAdditionalClonesLeft = () => {
    const additionalClones = this.getNeededAdditionalClones();
    return additionalClones < 0 ? -additionalClones : 0;
  };
  getAdditionalClonesRight = () => {
    const additionalClones = this.getNeededAdditionalClones();
    return additionalClones > 0 ? additionalClones : 0;
  };
  getClonesLeft = () => config.numberOfInfiniteClones + this.getAdditionalClonesLeft();
  getClonesRight = () => config.numberOfInfiniteClones + this.getAdditionalClonesRight();

  getAdditionalClonesOffset = () =>
    -this.getChildren().length * this.getCarouselElementWidth() * this.getAdditionalClonesLeft();

  /**
   * Returns the value of a prop based on the current window width and breakpoints provided
   * @param {string} propName name of the prop you want to get
   * @param {object} customProps props object (used e.g. when you want to get prop from prevProps object instead of this.props)
   * @return {any} props value
   */
  getProp = (propName, customProps = null) => {
    const props = customProps || this.props;
    let activeBreakpoint = null;
    if (props.breakpoints) {
      const windowWidth = this.state.windowWidth;
      const resolutions = Object.keys(props.breakpoints);
      resolutions.forEach(resolutionString => {
        const resolution = parseInt(resolutionString);
        if (windowWidth <= resolution) {
          if (!activeBreakpoint || activeBreakpoint > resolution) {
            activeBreakpoint = resolution;
          }
        }
      });
    }
    if (activeBreakpoint) {
      if (has(props.breakpoints[activeBreakpoint], propName)) {
        return props.breakpoints[activeBreakpoint][propName];
      }
    }
    return props[propName];
  };

  /**
   * Check if this.props.value changed after update
   * @param {object} prevProps
   * @return {boolean} result
   */
  checkIfValueChanged = prevProps => {
    const currentValue = this.getProp('infinite') ? this.props.value : this.clamp(this.props.value);
    const prevValue = this.getProp('infinite') ? prevProps.value : this.clamp(prevProps.value);
    return currentValue !== prevValue;
  };

  /**
   * Check if this.props.valueY changed after update
   * @param {object} prevProps
   * @return {boolean} result
   */
  checkIfValueYChanged = prevProps => {
    const currentValue = this.getProp('infinite') ? this.props.valueY : this.clamp(this.props.valueY);
    const prevValue = this.getProp('infinite') ? prevProps.valueY : this.clamp(prevProps.valueY);
    return currentValue !== prevValue;
  };

  resetInterval = () => {
    if (this.interval) {
      clearInterval(this.interval);
    }
    const autoPlay = this.getProp('autoPlay');
    if (!isNil(autoPlay)) {
      this.interval = setInterval(() => {
        if (!document.hidden && !this.state.isAutoPlayStopped) {
          this.nextSlide();
        }
      }, autoPlay);
    }
  };

  getChildren = () => {
    if (!this.props.children) {
      if (this.props.slides.rows) {
        return this.props.slides.rows;
      }
      return [];
    }
    if (Array.isArray(this.props.children)) {
      return this.props.children;
    }
    return [this.props.children];
  };

  getActiveSlideIndex = () => this.getProp('infinite')
    ? this.getCurrentSlideIndex() + this.getClonesLeft() * this.getChildren().length
    : this.getCurrentSlideIndex();

  getActiveSlideIndexY = () => this.getCurrentSlideIndexY();

  /* infinite calculations */
  getSlidesBounds = (customValue = null) => {
    const value = isNil(customValue) ? this.getCurrentValue() : customValue;
    const length = this.getChildren().length;
    const times = ((value + 1) / length);
    const ceil = Math.ceil(times);

    return {
      low: (ceil - 1) * length,
      high: ceil * length - 1,
    };
  };

  getTargetMod = (customValue = null) => {
    const value = isNil(customValue) ? this.getCurrentValue() : customValue;
    const length = this.getChildren().length;
    let targetSlide;
    if (value >= 0) {
      targetSlide = value % length;
    } else {
      targetSlide = (length - Math.abs(value % length)) % length;
    }
    return targetSlide;
  };

  getTargetSlide = () => {
    if (!isNil(this.state.infiniteTransitionFrom)) {
      const mod = this.getTargetMod(this.state.infiniteTransitionFrom);
      const value = this.getCurrentValue();

      return mod + (value - this.state.infiniteTransitionFrom);
    }
    return this.getTargetMod();
  };


  /* event handlers */
  /**
   * Handler setting the carouselWidth value in state (used to set proper width of track and slides)
   * throttled to improve performance
   * @type {Function}
   */
  onResize = throttle(() => {
    if (!this.node) {
      return;
    }

    const arrowLeftWidth = this.arrowLeftNode && this.arrowLeftNode.offsetWidth;
    const arrowRightWidth = this.arrowRightNode && this.arrowRightNode.offsetWidth;
    const width = this.node.offsetWidth - (arrowLeftWidth || 0) - (arrowRightWidth || 0);
    const height = this.node.offsetHeight;

    this.setState(() => ({
      carouselWidth: width,
      windowWidth: window.innerWidth,
      carouselHeight: height,
      windowHeight: window.innerHeight,
      //  carouselHeight: '600',
      //  windowHeight: '600',
    }));
  }, config.resizeEventListenerThrottle);

  /**
   * Function handling beginning of mouse drag by setting index of clicked item and coordinates of click in the state
   * @param {event} e event
   * @param {number} index of the element drag started on
   */
  onMouseDown = (e, index) => {
    // console.log('onMouseDown check', { e, index });
    e.preventDefault();
    e.stopPropagation();
    const { pageX, pageY } = e;
    this.setState(() => ({
      clicked: index,
      dragStart: pageX,
      dragStartY: pageY,
    }));
  };

  /**
   * Function handling mouse move if drag has started. Sets dragOffset in the state.
   * @param {event} e event
   */
  onMouseMove = e => {
    // console.log('onMouseMove check', { e });
    const { pageX, pageY } = e;
    if ((this.state.dragStart !== null) || (this.state.dragStartY !== null)) {
      this.setState(previousState => ({
        dragOffset: pageX - previousState.dragStart,
        dragOffsetY: pageY - previousState.dragStartY,
      }));
    }
    // console.log('dragOffset', this.state.dragOffset );
    // console.log('dragOffsetY', this.state.dragOffsetY );
  };

  /**
   * Function handling beginning of touch drag by setting index of touched item and coordinates of touch in the state
   * @param {event} e event
   * @param {number} index of the element drag started on
   */
  onTouchStart = (e, index) => {
    const { changedTouches } = e;
    this.setState(() => ({
      clicked: index,
      dragStart: changedTouches[0].pageX,
      dragStartY: changedTouches[0].pageY,
    }));
  };

  /**
   * Function handling touch move if drag has started. Sets dragOffset in the state.
   * @param {event} e event
   */
  onTouchMove = e => {
    if ((Math.abs(this.state.dragOffset) > this.props.minDraggableOffset) || (Math.abs(this.state.dragOffsetY) > this.props.minDraggableOffset)) {
      e.preventDefault();
      e.stopPropagation();
    }
    const { changedTouches } = e;
    if ((this.state.dragStart !== null) || (this.state.dragStartY !== null)) {
      this.setState(previousState => ({
        dragOffset: changedTouches[0].pageX - previousState.dragStart,
        dragOffsetY: changedTouches[0].pageY - previousState.dragStartY,
      }));
    }
  };

  /**
   * Function handling end of touch or mouse drag. If drag was long it changes current slide to the nearest one,
   * if drag was short (or it was just a click) it changes slide to the clicked (or touched) one.
   * It resets clicked index, dragOffset and dragStart values in state.
   * @param {event} e event
   */
  onMouseUpTouchEnd = e => {
    if ((this.state.dragStart !== null) || (this.state.dragStartY !== null)) {
      e.preventDefault();
      if (this.getProp('draggable')) {
        if (Math.abs(this.state.dragOffset) > config.clickDragThreshold) {
          this.changeSlide(this.getNearestSlideIndex());
        } else if (Math.abs(this.state.dragOffsetY) > config.clickDragThreshold) {
          this.changeSlideY(this.getNearestVerticalSlideIndex());
        }
        // default horizontal scroll for 'clickToChange' event
        else if (this.getProp('clickToChange')) {
          this.changeSlide(this.getProp('infinite')
            ? this.getCurrentValue() + this.state.clicked - this.getActiveSlideIndex()
            : this.state.clicked);
        }
      }
      this.setState(() => ({
        clicked: null,
        dragOffset: 0,
        dragOffsetY: 0,
        dragStart: null,
        dragStartY: null,
      }));
    }
  };

  /**
   * Handler setting transitionEnabled value in state to false after transition animation ends
   */
  onTransitionEnd = () => {
    this.setState(() => ({
      transitionEnabled: false,
      infiniteTransitionFrom: this.getProp('infinite') ? this.getCurrentValue() : null,
    }));
  };

  /**
   * Function handling mouse hover over element
   * Stops auto play
   */
  onMouseEnter = () => {
    this.setState(() => ({
      isAutoPlayStopped: true,
    }));
  };

  /**
   * Function handling mouse leaving element
   * Resumes auto play
   */
  onMouseLeave = () => {
    this.setState(() => ({
      isAutoPlayStopped: false,
    }));
    this.resetInterval();
  };

  /**
   * Simulates mouse events when touch events occur
   * @param {event} e A touch event
   */
  simulateEvent = e => {
    const touch = e.changedTouches[0];
    const {
      screenX,
      screenY,
      clientX,
      clientY,
    } = touch;
    const touchEventMap = {
      touchstart: 'mousedown',
      touchmove: 'mousemove',
      touchend: 'mouseup',
    };
    const simulatedEvent = new MouseEvent(
      touchEventMap[e.type],
      {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 1,
        screenX,
        screenY,
        clientX,
        clientY,
      },
    );
    touch.target.dispatchEvent(simulatedEvent);
  };


  /* ========== control ========== */
  /**
   * Clamps number between 0 and last slide index.
   * @param {number} value to be clamped
   * @return {number} new value
   */
  clamp = value => {
    const maxValue = this.getChildren().length - 1;
    if (value > maxValue) {
      return maxValue;
    }
    if (value < 0) {
      return 0;
    }
    return value;
  };

  /**
   * Clamps a provided value and triggers onChange
   * @param {number} value desired index to change current value to
   * @return {undefined}
   */
  changeSlide = value => this.props.onChange(this.getProp('infinite') ? value : this.clamp(value),this.getProp('valueY'));
  changeSlideY = value => this.props.onChange(this.getProp('value'),this.getProp('infinite') ? value : this.clamp(value));

  nextSlide = () => this.changeSlide(this.getCurrentValue() + this.getProp('slidesPerScroll'));

  prevSlide = () => this.changeSlide(this.getCurrentValue() - this.getProp('slidesPerScroll'));

  upSlide = () => this.changeSlideY(this.getCurrentValueY() + this.getProp('slidesPerScroll'));

  downSlide = () => this.changeSlideY(this.getCurrentValueY() - this.getProp('slidesPerScroll'));

  /* ========== positioning ========== */
  /**
   * Checks what slide index is the nearest to the current position (to calculate the result of dragging the slider)
   * @return {number} index
   */
  getNearestSlideIndex = () => {
    let slideIndexOffset = 0;
    if (this.getProp('keepDirectionWhenDragging')) {
      if (this.state.dragOffset > 0) {
        slideIndexOffset = -Math.ceil(this.state.dragOffset / this.getCarouselElementWidth());
      } else {
        slideIndexOffset = -Math.floor(this.state.dragOffset / this.getCarouselElementWidth());
      }
    } else {
      slideIndexOffset = -Math.round(this.state.dragOffset / this.getCarouselElementWidth());
    }
    return this.getCurrentValue() + slideIndexOffset;
  };

  getNearestVerticalSlideIndex = () => {
    let slideIndexOffset = 0;
    if (this.getProp('keepDirectionWhenDragging')) {
      if (this.state.dragOffsetY > 0) {
        slideIndexOffset = -Math.ceil(this.state.dragOffsetY / this.getCarouselElementHeight());
      } else {
        slideIndexOffset = -Math.floor(this.state.dragOffsetY / this.getCarouselElementHeight());
      }
    } else {
      slideIndexOffset = -Math.round(this.state.dragOffsetY / this.getCarouselElementHeight());
    }
    return this.getCurrentValueY() + slideIndexOffset;
  };
  /**
   * Returns the current slide index (from either props or internal state)
   * @return {number} index
   */
  getCurrentSlideIndex = () => {
    if (this.getProp('infinite')) {
      return this.getTargetSlide();
    }
    return this.clamp(this.getCurrentValue());
  };

  getCurrentSlideIndexY = () => {
    if (this.getProp('infinite')) {
      return this.getTargetSlide();
    }
    return this.clamp(this.getCurrentValueY());
  };
  /**
   * Calculates width of a single slide in a carousel
   * @return {number} width of a slide in px
   */
  getCarouselElementWidth = () => this.props.itemWidth || this.state.carouselWidth / this.getProp('slidesPerPage');

  /**
 * Calculates height of a single slide in a carousel
 * @return {number} height of a slide in px
 */
  getCarouselElementHeight = () => this.props.itemHeight || this.state.carouselHeight / this.getProp('slidesPerPage');

  /**
   * Calculates offset in pixels to be applied to Track element in order to show current slide correctly (centered or aligned to the left)
   * @return {number} offset in px
   */
  getTransformOffset = () => {
    const elementWidthWithOffset = this.getCarouselElementWidth() + this.getProp('offset');
    const additionalOffset = this.getProp('centered')
      ? (this.state.carouselWidth / 2) - (elementWidthWithOffset / 2)
      : 0;
    const dragOffset = this.getProp('draggable') ? this.state.dragOffset : 0;
    const currentValue = this.getActiveSlideIndex();
    console.log("X->currentValue", { currentValue });
    // const currentValue = 1;
    const additionalClonesOffset = this.getAdditionalClonesOffset();
    // console.log("X",{dragOffset,currentValue,elementWidthWithOffset, additionalOffset, additionalClonesOffset});
    return dragOffset - currentValue * elementWidthWithOffset + additionalOffset - additionalClonesOffset;
    // return dragOffset;
  };

  /**
 * Calculates offset in pixels to be applied to Track element in order to show current slide correctly (centered or aligned to the left)
 * @return {number} offset in px
 */
  getTransformOffsetY = () => {
    const elementHeightWithOffset = this.getCarouselElementHeight() + this.getProp('offset');
    const additionalOffset = this.getProp('centered')
      ? (this.state.carouselHeight / 2) - (elementHeightWithOffset / 2)
      : 0;
    const dragOffsetY = this.getProp('draggable') ? this.state.dragOffsetY : 0;
    const currentValue = this.getActiveSlideIndexY();
    console.log("Y->currentValue", { currentValue });
    // const currentValue = 1;
    const additionalClonesOffset = this.getAdditionalClonesOffset();
    // console.log("Y", { dragOffsetY, currentValue, elementHeightWithOffset, additionalOffset, additionalClonesOffset });
    // return dragOffsetY - currentValue * elementHeightWithOffset + additionalOffset - additionalClonesOffset;
    return dragOffsetY - currentValue * elementHeightWithOffset + elementHeightWithOffset;
    // return dragOffsetY;
  };

  /* ========== rendering ========== */
  renderCarouselItems = () => {
    const transformOffset = this.getTransformOffset();
    const transformOffsetY = this.getTransformOffsetY();
    const children = this.getChildren();

    const numberOfClonesLeft = this.getClonesLeft();
    const numberOfClonesRight = this.getClonesRight();

    const trackLengthMultiplier = 1 + (this.getProp('infinite') ? numberOfClonesLeft + numberOfClonesRight : 0);
    const trackWidth = this.state.carouselWidth * children.length * trackLengthMultiplier;
    // const trackWidth = this.state.carouselWidth * 3 * trackLengthMultiplier;
    // const trackHeight = this.state.carouselHeight * children.length * trackLengthMultiplier;
    const trackHeight = this.state.carouselHeight * 1 * trackLengthMultiplier;
    const animationSpeed = this.getProp('animationSpeed');
    const transitionEnabled = this.state.transitionEnabled;
    const draggable = this.getProp('draggable') && children && children.length > 1;

    const trackStyles = {
      marginLeft: `${this.getAdditionalClonesOffset()}px`,
      height: `${trackHeight}px`,
      // height: `600px`,
      width: `${trackWidth}px`,
      // transform: `translateX(${transformOffset}px)`,
      // transform: `translateY(${transformOffsetY}px)`,
      transform: `translateX(${transformOffset}px) translateY(${transformOffsetY}px)`,
      transitionDuration: transitionEnabled ? `${animationSpeed}ms, ${animationSpeed}ms` : null,
    };

    // let slides = children;
    let rows = children;
    // if (this.getProp('infinite')) {
    //   const clonesLeft = times(numberOfClonesLeft, () => children);
    //   const clonesRight = times(numberOfClonesRight, () => children);
    //   slides = concat(...clonesLeft, children, ...clonesRight);
    // }

    const isAutoPlay = this.getProp('autoPlay');
    const isStopAutoPlayOnHover = this.getProp('stopAutoPlayOnHover');
    const handleAutoPlayEvent = action => (isAutoPlay && isStopAutoPlayOnHover) ? action : null;

    return (
      <div className="BrainhubCarousel__trackContainer">
        {rows.map((row, rowIndex) => (
          <ul
            className={classnames(
              'BrainhubCarousel__track',
              {
                'BrainhubCarousel__track--transition': transitionEnabled,
                'BrainhubCarousel__track--draggable': draggable,
              },
            )}
            style={trackStyles}
            ref={el => this.trackRef = el}
            onMouseEnter={handleAutoPlayEvent(this.onMouseEnter)}
            onMouseLeave={handleAutoPlayEvent(this.onMouseLeave)}
          >
            {row.items.map((carouselItem, index) => (
              <CarouselItem
                key={index}
                currentSlideIndex={this.getActiveSlideIndex()}
                currentSlideIndexY={this.getActiveSlideIndexY()}
                index={index}
                width={this.getCarouselElementWidth()}
                height={this.getCarouselElementHeight()}
                // offset={index !== slides.length ? this.props.offset : 0}
                offset={index !== row.items.length ? this.props.offset : 0}
                onMouseDown={this.onMouseDown}
                onTouchStart={this.onTouchStart}
                clickable={this.getProp('clickToChange')}
                isDragging={(Math.abs(this.state.dragOffset) > this.props.minDraggableOffset) || (Math.abs(this.state.dragOffsetY) > this.props.minDraggableOffset)}
              >
                {carouselItem}
              </CarouselItem>
            ))}
          </ul>
        ))}


        {/* <ul
          className={classnames(
            'BrainhubCarousel__track',
            {
              'BrainhubCarousel__track--transition': transitionEnabled,
              'BrainhubCarousel__track--draggable': draggable,
            },
          )}
          style={trackStyles}
          ref={el => this.trackRef = el}
          onMouseEnter={handleAutoPlayEvent(this.onMouseEnter)}
          onMouseLeave={handleAutoPlayEvent(this.onMouseLeave)}
        >
          {slides.map((carouselItem, index) => (
            <CarouselItem
              key={index}
              currentSlideIndex={this.getActiveSlideIndex()}
              index={index}
              width={this.getCarouselElementWidth()}
              height={this.getCarouselElementHeight()}
              offset={index !== slides.length ? this.props.offset : 0}
              onMouseDown={this.onMouseDown}
              onTouchStart={this.onTouchStart}
              clickable={this.getProp('clickToChange')}
              isDragging={Math.abs(this.state.dragOffset) > this.props.minDraggableOffset}
            >
              {carouselItem}
            </CarouselItem>
          ))}
        </ul> */}
        {/* <ul
          className={classnames(
            'BrainhubCarousel__track',
            {
              'BrainhubCarousel__track--transition': transitionEnabled,
              'BrainhubCarousel__track--draggable': draggable,
            },
          )}
          style={trackStyles}
          ref={el => this.trackRef = el}
          onMouseEnter={handleAutoPlayEvent(this.onMouseEnter)}
          onMouseLeave={handleAutoPlayEvent(this.onMouseLeave)}
        >
          {slides.map((carouselItem, index) => (
            <CarouselItem
              key={index}
              currentSlideIndex={this.getActiveSlideIndex()}
              index={index}
              width={this.getCarouselElementWidth()}
              height={this.getCarouselElementHeight()}
              offset={index !== slides.length ? this.props.offset : 0}
              onMouseDown={this.onMouseDown}
              onTouchStart={this.onTouchStart}
              clickable={this.getProp('clickToChange')}
              isDragging={Math.abs(this.state.dragOffset) > this.props.minDraggableOffset}
            >
              {carouselItem}
            </CarouselItem>
          ))}
        </ul>
        <ul
          className={classnames(
            'BrainhubCarousel__track',
            {
              'BrainhubCarousel__track--transition': transitionEnabled,
              'BrainhubCarousel__track--draggable': draggable,
            },
          )}
          style={trackStyles}
          ref={el => this.trackRef = el}
          onMouseEnter={handleAutoPlayEvent(this.onMouseEnter)}
          onMouseLeave={handleAutoPlayEvent(this.onMouseLeave)}
        >
          {slides.map((carouselItem, index) => (
            <CarouselItem
              key={index}
              currentSlideIndex={this.getActiveSlideIndex()}
              index={index}
              width={this.getCarouselElementWidth()}
              height={this.getCarouselElementHeight()}
              offset={index !== slides.length ? this.props.offset : 0}
              onMouseDown={this.onMouseDown}
              onTouchStart={this.onTouchStart}
              clickable={this.getProp('clickToChange')}
              isDragging={Math.abs(this.state.dragOffset) > this.props.minDraggableOffset}
            >
              {carouselItem}
            </CarouselItem>
          ))}
        </ul>                 */}
      </div>
    );
  };

  /**
   * Adds onClick handler to the arrow if possible (if it does not already have one)
   * @param {ReactElement} element to render
   * @param {function} onClick handler to be added to element
   * @param {string} name of an element
   * @return {ReactElement} element with added handler
   */
  renderArrowWithAddedHandler = (element, onClick, name) => (
    <div
      className={classnames('BrainhubCarousel__customArrows', `BrainhubCarousel__custom-${name}`)}
      ref={el => this[`${name}Node`] = el}
      onClick={this.getProp('addArrowClickHandler') ? onClick : null}
    >
      {element}
    </div>
  );

  /**
  * Renders arrow Top
  * @return {ReactElement} element
  * TODO: change prevSlide handing to topSlide handling
  */
  renderArrowTop = () => {
    if (this.getProp('arrowTop')) {
      return this.renderArrowWithAddedHandler(this.getProp('arrowTop'), this.prevSlide, 'arrowTop');
    }
    if (this.getProp('arrows')) {
      return (
        <button
          className="BrainhubCarousel__arrows BrainhubCarousel__arrowTop"
          onClick={this.prevSlide}
          ref={el => this.arrowLeftNode = el}
        >
          <span>top</span>
        </button>
      );
    }
    return null;
  };

  /**
  * Renders arrow Bottom
  * @return {ReactElement} element
  * TODO: change prevSlide handing to BottomSlide handling
  */
  renderArrowBottom = () => {
    if (this.getProp('arrowBottom')) {
      return this.renderArrowWithAddedHandler(this.getProp('arrowBottom'), this.nextSlide, 'arrowBottom');
    }
    if (this.getProp('arrows')) {
      return (
        <button
          className="BrainhubCarousel__arrows BrainhubCarousel__arrowBottom"
          onClick={this.nextSlide}
          ref={el => this.arrowRightNode = el}
        >
          <span>bottom</span>
        </button>
      );
    }
    return null;
  };

  /**
   * Renders arrow left
   * @return {ReactElement} element
   */
  renderArrowLeft = () => {
    if (this.getProp('arrowLeft')) {
      return this.renderArrowWithAddedHandler(this.getProp('arrowLeft'), this.prevSlide, 'arrowLeft');
    }
    if (this.getProp('arrows')) {
      return (
        <button
          className="BrainhubCarousel__arrows BrainhubCarousel__arrowLeft"
          onClick={this.prevSlide}
          ref={el => this.arrowLeftNode = el}
        >
          <span>prev</span>
        </button>
      );
    }
    return null;
  };

  /**
   * Renders arrow right
   * @return {ReactElement} element
   */
  renderArrowRight = () => {
    if (this.getProp('arrowRight')) {
      return this.renderArrowWithAddedHandler(this.getProp('arrowRight'), this.nextSlide, 'arrowRight');
    }
    if (this.getProp('arrows')) {
      return (
        <button
          className="BrainhubCarousel__arrows BrainhubCarousel__arrowRight"
          onClick={this.nextSlide}
          ref={el => this.arrowRightNode = el}
        >
          <span>next</span>
        </button>
      );
    }
    return null;
  };

  renderDots() {
    if (this.getProp('dots')) {
      return <Dots value={this.getCurrentValue()} onChange={this.changeSlide} number={this.getChildren().length} />;
    }
    return null;
  }

  render() {

    const arrowTopBottomStyles = {
      'justify-content': 'center'
    };

    return (
      <div>
        {/* <ul className="BrainhubCarousel"
          style={arrowTopBottomStyles}
        >{this.renderArrowTop()}</ul> */}
        <div
          className={classnames('BrainhubCarousel', this.getProp('className'))}
          ref={el => this.node = el}
        >
          {this.renderArrowLeft()}
          {this.renderCarouselItems()}
          {this.renderArrowRight()}
        </div>
        {/* <ul className="BrainhubCarousel"
          style={arrowTopBottomStyles}
        >{this.renderArrowBottom()}</ul> */}
        {this.renderDots()}
      </div>
    );
  }
}
