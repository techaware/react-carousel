import React, { Component } from 'react';
import isNil from 'lodash/isNil';
import PropTypes from 'prop-types';

import Carousel from './Carousel';

export default class CarouselWrapper extends Component {
  static propTypes = {
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    valueY: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onChange: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = {
      value: 1,
      valueY: 1,
    };
  }

  onChange = (value, valueY) => this.setState({
    value: value,
    valueY: valueY
  });

  render() {
    const { value,valueY,onChange, ...rest } = this.props;
    const isControlled = !isNil(value);
    return (
      <Carousel
        value={isControlled ? parseInt(value) : this.state.value}
        valueY={isControlled ? parseInt(valueY) : this.state.valueY}
        onChange={isControlled ? onChange : this.onChange}
        {...rest}
      />
    );
  }
}
