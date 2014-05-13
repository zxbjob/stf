var FastImageRender = require('./fast-image-render').FastImageRender

module.exports = function DeviceScreenDirective(
  $document
, ScalingService
, VendorUtil
, PageVisibilityService
) {
  return {
    restrict: 'E',
    template: require('./screen.jade'),
    link: function (scope, element) {
      var canvas = element.find('canvas')[0]
        , imageRender = new FastImageRender(canvas, {render: 'canvas'})
        , finger = element.find('span')
        , input = element.find('textarea')
        , boundingWidth = 0  // TODO: cache inside FastImageRender?
        , boundingHeight = 0
        , cachedBoundingWidth = 0
        , cachedBoundingHeight = 0
        , cachedImageWidth = 0
        , cachedImageHeight = 0
        , cachedRotation = 0
        , rotation = 0
        , loading = false
        , scaler
        , seq = 0
        , cssTransform = VendorUtil.style(['transform', 'webkitTransform'])

      scope.$on('panelsResized', updateBounds)

      function sendTouch(type, e) {
        var x = e.offsetX || e.layerX || 0
          , y = e.offsetY || e.layerY || 0
          , r = scope.device.display.orientation
          , scaled = scaler.coords(boundingWidth, boundingHeight, x, y, r)

        finger[0].style[cssTransform] =
          'translate3d(' + x + 'px,' + y + 'px,0)'

        scope.control[type](
            seq++
          , scaled.xP
          , scaled.yP
        )
      }

      function stopTouch() {
        element.removeClass('fingering')
        element.unbind('mousemove', moveListener)
        $document.unbind('mouseup', upListener)
        $document.unbind('mouseleave', upListener)
        seq = 0
      }

      function updateBounds() {
        boundingWidth = element[0].offsetWidth
        boundingHeight = element[0].offsetHeight

        // Developer error, let's try to reduce debug time
        if (!boundingWidth || !boundingHeight) {
          throw new Error(
            'Unable to update display size; container must have dimensions'
          )
        }
      }

      function downListener(e) {
        e.preventDefault()
        input[0].focus()
        element.addClass('fingering')
        sendTouch('touchDown', e)
        element.bind('mousemove', moveListener)
        $document.bind('mouseup', upListener)
        $document.bind('mouseleave', upListener)
      }

      function moveListener(e) {
        sendTouch('touchMove', e)
      }

      function upListener(e) {
        sendTouch('touchUp', e)
        stopTouch()
      }

      function keydownListener(e) {
        scope.control.keyDown(e.keyCode)
      }

      function keyupListener(e) {
        scope.control.keyUp(e.keyCode)
      }

      function keypressListener(e) {
        e.preventDefault() // no need to change value
        scope.control.type(String.fromCharCode(e.charCode))
      }

      function pasteListener(e) {
        e.preventDefault() // no need to change value
        scope.control.paste(e.clipboardData.getData('text/plain'))
      }

      function maybeLoadScreen() {
        if (!loading && scope.canView && scope.showScreen && scope.device) {
          loading = true
          imageRender.load(scope.device.display.url +
            '?width=' + boundingWidth +
            '&height=' + boundingHeight +
            '&time=' + Date.now()
          )
        }
      }

      function on() {
        scaler = ScalingService.coordinator(
          scope.device.display.width
        , scope.device.display.height
        )

        imageRender.onLoad = function (image) {
          loading = false

          if (scope.canView && scope.showScreen) {

            // Check to set the size only if updated
            if (cachedBoundingWidth !== boundingWidth ||
              cachedBoundingHeight !== boundingHeight ||
              cachedImageWidth !== image.width ||
              cachedImageHeight !== image.height ||
              cachedRotation !== rotation) {

              cachedBoundingWidth = boundingWidth
              cachedBoundingHeight = boundingHeight

              cachedImageWidth = image.width
              cachedImageHeight = image.height

              cachedRotation = rotation

              imageRender.canvasWidth = cachedImageWidth
              imageRender.canvasHeight = cachedImageHeight

              var size = scaler.projectedSize(
                boundingWidth
              , boundingHeight
              , rotation
              )

              imageRender.canvasStyleWidth = size.width
              imageRender.canvasStyleHeight = size.height

              // @todo Make sure that each position is able to rotate smoothly
              // to the next one. This current setup doesn't work if rotation
              // changes from 180 to 270 (it will do a reverse rotation).
              switch (rotation) {
                case 0:
                  canvas.style[cssTransform] = 'rotate(0deg)'
                  break
                case 90:
                  canvas.style[cssTransform] = 'rotate(-90deg)'
                  break
                case 180:
                  canvas.style[cssTransform] = 'rotate(-180deg)'
                  break
                case 270:
                  canvas.style[cssTransform] = 'rotate(90deg)'
                  break
              }
            }

            imageRender.draw(image)

            // Reset error, if any
            if (scope.displayError) {
              scope.$apply(function () {
                scope.displayError = false
              })
            }

            // Next please
            maybeLoadScreen()
          } else {
            console.log('Nothing to show')
          }
        }

        imageRender.onError = function () {
          loading = false

          scope.$apply(function () {
            scope.displayError = true
          })
        }

        updateBounds()
        maybeLoadScreen()

        input.bind('keydown', keydownListener)
        input.bind('keyup', keyupListener)
        input.bind('keypress', keypressListener)
        input.bind('paste', pasteListener)
        element.bind('mousedown', downListener)
      }

      function off() {
        imageRender.onLoad = imageRender.onError = null
        loading = false
        stopTouch()
        input.unbind('keydown', keydownListener)
        input.unbind('keyup', keyupListener)
        input.unbind('keypress', keypressListener)
        input.unbind('paste', pasteListener)
        element.unbind('mousedown', downListener)
      }

      scope.$watch('canView', function (val) {
        if (val) {
          maybeLoadScreen()
        } else {
          scope.fps = null
          //imageRender.clear()
        }
      })

      scope.$watch('showScreen', function (val) {
        if (val) {
          maybeLoadScreen()
        } else {
          scope.fps = null
          //imageRender.clear()
        }
      })

      scope.$watch('device.using', function(using) {
        if (using) {
          on()
        }
        else {
          off()
        }
      })

      scope.$on('visibilitychange', function(e, hidden) {
        if (hidden) {
          off()
        }
        else {
          on()
        }
      })

      scope.$watch('device.display.orientation', function(r) {
        rotation = r || 0
      })

      scope.$on('$destroy', off)
    }
  }
}
