



'use strict';

CKEDITOR.plugins.add( 'notification', {
	lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
	requires: 'toolbar',

	init: function( editor ) {
		editor._.notificationArea = new Area( editor );

		// Overwrites default `editor.showNotification`.
		editor.showNotification = function( message, type, progressOrDuration ) {
			var progress, duration;

			if ( type == 'progress' ) {
				progress = progressOrDuration;
			} else {
				duration = progressOrDuration;
			}

			var notification = new CKEDITOR.plugins.notification( editor, {
				message: message,
				type: type,
				progress: progress,
				duration: duration
			} );

			notification.show();

			return notification;
		};

		// Close the last notification on ESC.
		editor.on( 'key', function( evt ) {
			if ( evt.data.keyCode == 27 ) { 
				var notifications = editor._.notificationArea.notifications;

				if ( !notifications.length ) {
					return;
				}

				// As long as this is not a common practice to inform screen-reader users about actions, in this case
				// this is the best solution (unfortunately there is no standard for accessibility for notifications).
				// Notification has an `alert` aria role what means that it does not get a focus nor is needed to be
				// closed (unlike `alertdialog`). However notification will capture ESC key so we need to inform user
				// why it does not do other actions.
				say( editor.lang.notification.closed );

				// Hide last.
				notifications[ notifications.length - 1 ].hide();

				evt.cancel();
			}
		} );

		// Send the message to the screen readers.
		function say( text ) {
			var message = new CKEDITOR.dom.element( 'div' );
			message.setStyles( {
				position: 'fixed',
				'margin-left': '-9999px'
			} );
			message.setAttributes( {
				'aria-live': 'assertive',
				'aria-atomic': 'true'
			} );
			message.setText( text );

			CKEDITOR.document.getBody().append( message );

			setTimeout( function() {
				message.remove();
			}, 100 );
		}
	}
} );


function Notification( editor, options ) {
	CKEDITOR.tools.extend( this, options, {
		editor: editor,
		id: 'cke-' + CKEDITOR.tools.getUniqueId(),
		area: editor._.notificationArea
	} );

	if ( !options.type ) {
		this.type = 'info';
	}

	this.element = this._createElement();

	// Don't allow dragging on notification (#13184).
	editor.plugins.clipboard && CKEDITOR.plugins.clipboard.preventDefaultDropOnElement( this.element );
}

















Notification.prototype = {
	
	show: function() {
		if ( this.editor.fire( 'notificationShow', { notification: this } ) === false ) {
			return;
		}

		this.area.add( this );

		this._hideAfterTimeout();
	},

	
	update: function( options ) {
		var show = true;

		if ( this.editor.fire( 'notificationUpdate', { notification: this, options: options } ) === false ) {
			// The idea of cancelable event is to let user create his own way of displaying notification, so if
			// `notificationUpdate` event will be canceled there will be no interaction with notification area, but on
			// the other hand the logic should work anyway so object will be updated (including `element` property).
			// Note: we can safely update the element's attributes below, because this element is created inside
			// the constructor. If the notificatinShow event was canceled as well, the element is detached from DOM.
			show = false;
		}

		var element = this.element,
			messageElement = element.findOne( '.cke_notification_message' ),
			progressElement = element.findOne( '.cke_notification_progress' ),
			type = options.type;

		element.removeAttribute( 'role' );

		// Change type to progress if `options.progress` is set.
		if ( options.progress && this.type != 'progress' ) {
			type = 'progress';
		}

		if ( type ) {
			element.removeClass( this._getClass() );
			element.removeAttribute( 'aria-label' );

			this.type = type;

			element.addClass( this._getClass() );
			element.setAttribute( 'aria-label', this.type );

			if ( this.type == 'progress' && !progressElement ) {
				progressElement = this._createProgressElement();
				progressElement.insertBefore( messageElement );
			} else if ( this.type != 'progress' && progressElement ) {
				progressElement.remove();
			}
		}

		if ( options.message !== undefined ) {
			this.message = options.message;
			messageElement.setHtml( this.message );
		}

		if ( options.progress !== undefined ) {
			this.progress = options.progress;

			if ( progressElement ) {
				progressElement.setStyle( 'width', this._getPercentageProgress() );
			}
		}

		if ( show && options.important ) {
			element.setAttribute( 'role', 'alert' );

			if ( !this.isVisible() ) {
				this.area.add( this );
			}
		}

		// Overwrite even if it is undefined.
		this.duration = options.duration;

		this._hideAfterTimeout();
	},

	
	hide: function() {
		if ( this.editor.fire( 'notificationHide', { notification: this } ) === false ) {
			return;
		}

		this.area.remove( this );
	},

	
	isVisible: function() {
		return CKEDITOR.tools.indexOf( this.area.notifications, this ) >= 0;
	},

	
	_createElement: function() {
		var notification = this,
			notificationElement, notificationMessageElement, notificationCloseElement,
			close = this.editor.lang.common.close;

		notificationElement = new CKEDITOR.dom.element( 'div' );
		notificationElement.addClass( 'cke_notification' );
		notificationElement.addClass( this._getClass() );
		notificationElement.setAttributes( {
			id: this.id,
			role: 'alert',
			'aria-label': this.type
		} );

		if ( this.type == 'progress' )
			notificationElement.append( this._createProgressElement() );

		notificationMessageElement = new CKEDITOR.dom.element( 'p' );
		notificationMessageElement.addClass( 'cke_notification_message' );
		notificationMessageElement.setHtml( this.message );
		notificationElement.append( notificationMessageElement );

		notificationCloseElement = CKEDITOR.dom.element.createFromHtml(
			'<a class="cke_notification_close" href="javascript:void(0)" title="' + close + '" role="button" tabindex="-1">' +
				'<span class="cke_label">X</span>' +
			'</a>' );
		notificationElement.append( notificationCloseElement );

		notificationCloseElement.on( 'click', function() {
			// Focus editor on close (#12865)
			notification.editor.focus();

			notification.hide();
		} );

		return notificationElement;
	},

	
	_getClass: function() {
		return ( this.type == 'progress' ) ?
			'cke_notification_info' :
			( 'cke_notification_' + this.type );
	},

	
	_createProgressElement: function() {
		var element = new CKEDITOR.dom.element( 'span' );
		element.addClass( 'cke_notification_progress' );
		element.setStyle( 'width', this._getPercentageProgress() );
		return element;
	},

	
	_getPercentageProgress: function() {
		return Math.round( ( this.progress || 0 ) * 100 ) + '%';
	},

	
	_hideAfterTimeout: function() {
		var notification = this,
			duration;

		if ( this._hideTimeoutId ) {
			clearTimeout( this._hideTimeoutId );
		}

		if ( typeof this.duration == 'number' ) {
			duration = this.duration;
		} else if ( this.type == 'info' || this.type == 'success' ) {
			duration = ( typeof this.editor.config.notification_duration == 'number' ) ?
				this.editor.config.notification_duration :
				5000;
		}

		if ( duration ) {
			notification._hideTimeoutId = setTimeout( function() {
				notification.hide();
			}, duration );
		}
	}
};


function Area( editor ) {
	var that = this;

	this.editor = editor;
	this.notifications = [];
	this.element = this._createElement();
	this._uiBuffer = CKEDITOR.tools.eventsBuffer( 10, this._layout, this );
	this._changeBuffer = CKEDITOR.tools.eventsBuffer( 500, this._layout, this );

	editor.on( 'destroy', function() {
		that._removeListeners();
		that.element.remove();
	} );
}















Area.prototype = {
	
	add: function( notification ) {
		this.notifications.push( notification );

		this.element.append( notification.element );

		if ( this.element.getChildCount() == 1 ) {
			CKEDITOR.document.getBody().append( this.element );
			this._attachListeners();
		}

		this._layout();
	},

	
	remove: function( notification ) {
		var i = CKEDITOR.tools.indexOf( this.notifications, notification );

		if ( i < 0 ) {
			return;
		}

		this.notifications.splice( i, 1 );

		notification.element.remove();

		if ( !this.element.getChildCount() ) {
			this._removeListeners();
			this.element.remove();
		}
	},

	
	_createElement: function() {
		var editor = this.editor,
			config = editor.config,
			notificationArea = new CKEDITOR.dom.element( 'div' );

		notificationArea.addClass( 'cke_notifications_area' );
		notificationArea.setAttribute( 'id', 'cke_notifications_area_' + editor.name );
		notificationArea.setStyle( 'z-index', config.baseFloatZIndex - 2 );

		return notificationArea;
	},

	
	_attachListeners: function() {
		var win = CKEDITOR.document.getWindow(),
			editor = this.editor;

		win.on( 'scroll', this._uiBuffer.input );
		win.on( 'resize', this._uiBuffer.input );
		editor.on( 'change', this._changeBuffer.input );
		editor.on( 'floatingSpaceLayout', this._layout, this, null, 20 );
		editor.on( 'blur', this._layout, this, null, 20 );
	},

	
	_removeListeners: function() {
		var win = CKEDITOR.document.getWindow(),
			editor = this.editor;

		win.removeListener( 'scroll', this._uiBuffer.input );
		win.removeListener( 'resize', this._uiBuffer.input );
		editor.removeListener( 'change', this._changeBuffer.input );
		editor.removeListener( 'floatingSpaceLayout', this._layout );
		editor.removeListener( 'blur', this._layout );
	},

	
	_layout: function() {
		var area = this.element,
			editor = this.editor,
			contentsRect = editor.ui.contentsElement.getClientRect(),
			contentsPos = editor.ui.contentsElement.getDocumentPosition(),
			top = editor.ui.space( 'top' ),
			topRect = top.getClientRect(),
			areaRect = area.getClientRect(),
			notification,
			notificationWidth = this._notificationWidth,
			notificationMargin = this._notificationMargin,
			win = CKEDITOR.document.getWindow(),
			scrollPos = win.getScrollPosition(),
			viewRect = win.getViewPaneSize(),
			body = CKEDITOR.document.getBody(),
			bodyPos = body.getDocumentPosition(),
			cssLength = CKEDITOR.tools.cssLength;

		// Cache for optimization
		if ( !notificationWidth || !notificationMargin ) {
			notification = this.element.getChild( 0 );
			notificationWidth = this._notificationWidth = notification.getClientRect().width;
			notificationMargin = this._notificationMargin =
				parseInt( notification.getComputedStyle( 'margin-left' ), 10 ) +
				parseInt( notification.getComputedStyle( 'margin-right' ), 10 );
		}

		// --------------------------------------- Horizontal layout ----------------------------------------

		// +---Viewport-------------------------------+          +---Viewport-------------------------------+
		// |                                          |          |                                          |
		// | +---Toolbar----------------------------+ |          | +---Content----------------------------+ |
		// | |                                      | |          | |                                      | |
		// | +---Content----------------------------+ |          | |                                      | |
		// | |                                      | |          | +---Toolbar----------------------+     | |
		// | |      +------Notification------+      | |          | |                                |     | |
		// | |                                      | |    OR    | +--------------------------------+     | |
		// | |                                      | |          | |                                      | |
		// | |                                      | |          | |      +------Notification------+      | |
		// | |                                      | |          | |                                      | |
		// | |                                      | |          | |                                      | |
		// | +--------------------------------------+ |          | +--------------------------------------+ |
		// +------------------------------------------+          +------------------------------------------+
		if ( top.isVisible() &&
			topRect.bottom > contentsRect.top &&
			topRect.bottom < contentsRect.bottom - areaRect.height ) {
			setBelowToolbar();

		// +---Viewport-------------------------------+
		// |                                          |
		// | +---Content----------------------------+ |
		// | |                                      | |
		// | |      +------Notification------+      | |
		// | |                                      | |
		// | |                                      | |
		// | |                                      | |
		// | +--------------------------------------+ |
		// |                                          |
		// +------------------------------------------+
		} else if ( contentsRect.top > 0 ) {
			setTopStandard();

		//   +---Content----------------------------+
		//   |                                      |
		// +---Viewport-------------------------------+
		// | |                                      | |
		// | |      +------Notification------+      | |
		// | |                                      | |
		// | |                                      | |
		// | |                                      | |
		// | +--------------------------------------+ |
		// |                                          |
		// +------------------------------------------+
		} else if ( contentsPos.y + contentsRect.height - areaRect.height > scrollPos.y ) {
			setTopFixed();

		//   +---Content----------------------------+              +---Content----------------------------+
		//   |                                      |              |                                      |
		//   |                                      |              |                                      |
		//   |                                      |              |      +------Notification------+      |
		//   |                                      |              |                                      |
		//   |                                      |      OR      +--------------------------------------+
		// +---Viewport-------------------------------+
		// | |      +------Notification------+      | |          +---Viewport-------------------------------+
		// | |                                      | |          |                                          |
		// | +--------------------------------------+ |          |                                          |
		// |                                          |          |                                          |
		// +------------------------------------------+          +------------------------------------------+
		} else {
			setBottom();
		}

		function setTopStandard() {
			area.setStyles( {
				position: 'absolute',
				top: cssLength( contentsPos.y )
			} );
		}

		function setBelowToolbar() {
			area.setStyles( {
				position: 'fixed',
				top: cssLength( topRect.bottom )
			} );
		}

		function setTopFixed() {
			area.setStyles( {
				position: 'fixed',
				top: 0
			} );
		}

		function setBottom() {
			area.setStyles( {
				position: 'absolute',
				top: cssLength( contentsPos.y + contentsRect.height - areaRect.height )
			} );
		}

		// ---------------------------------------- Vertical layout -----------------------------------------

		var leftBase = area.getStyle( 'position' ) == 'fixed' ?
			contentsRect.left :
			body.getComputedStyle( 'position' ) != 'static' ? contentsPos.x - bodyPos.x : contentsPos.x;

		// Content is narrower than notification
		if ( contentsRect.width < notificationWidth + notificationMargin ) {

			// +---Viewport-------------------------------+
			// |                                          |
			// |                 +---Content------------+ |
			// |                 |                      | |
			// |             +------Notification------+ | |
			// |                 |                      | |
			// |                 +----------------------+ |
			// |                                          |
			// +------------------------------------------+
			if ( contentsPos.x + notificationWidth + notificationMargin > scrollPos.x + viewRect.width ) {
				setRight();

			// +---Viewport-------------------------------+               +---Viewport--------------------------+
			// |                                          |               |                                     |
			// |     +---Content------------+             |            +---Content------------+                 |
			// |     |                      |             |            |  |                   |                 |
			// |     | +------Notification------+         |    OR      | +------Notification------+             |
			// |     |                      |             |            |  |                   |                 |
			// |     +----------------------+             |            +----------------------+                 |
			// |                                          |               |                                     |
			// +------------------------------------------+               +-------------------------------------+
			} else {
				setLeft();
			}

		// Content is wider than notification.
		} else {

			//                       +--+Viewport+------------------------+
			//                       |                                    |
			//                       |             +---Content-----------------------------------------+
			//                       |             |                      |                            |
			//                       |             | +-----+Notification+-----+                        |
			//                       |             |                      |                            |
			//                       |             |                      |                            |
			//                       |             |                      |                            |
			//                       |             +---------------------------------------------------+
			//                       |                                    |
			//                       +------------------------------------+
			if ( contentsPos.x + notificationWidth + notificationMargin > scrollPos.x + viewRect.width ) {
				setLeft();

			//                       +---Viewport-------------------------+
			//                       |                                    |
			//                       |  +---Content----------------------------------------------+
			//                       |  |                                 |                      |
			//                       |  |      +------Notification------+ |                      |
			//                       |  |                                 |                      |
			//                       |  |                                 |                      |
			//                       |  +--------------------------------------------------------+
			//                       |                                    |
			//                       +------------------------------------+
			} else if ( contentsPos.x + contentsRect.width / 2 +
				notificationWidth / 2 + notificationMargin > scrollPos.x + viewRect.width ) {
				setRightFixed();

			//                       +---Viewport-------------------------+
			//                       |                                    |
			//   +---Content----------------------------+                 |
			//   |                   |                  |                 |
			//   |           +------Notification------+ |                 |
			//   |                   |                  |                 |
			//   |                   |                  |                 |
			//   +--------------------------------------+                 |
			//                       |                                    |
			//                       +------------------------------------+
			} else if ( contentsRect.left + contentsRect.width - notificationWidth - notificationMargin < 0 ) {
				setRight();

			//                       +---Viewport-------------------------+
			//                       |                                    |
			// +---Content---------------------------------------------+  |
			// |                     |                                 |  |
			// |                     | +------Notification------+      |  |
			// |                     |                                 |  |
			// |                     |                                 |  |
			// +-------------------------------------------------------+  |
			//                       |                                    |
			//                       +------------------------------------+
			} else if ( contentsRect.left + contentsRect.width / 2 - notificationWidth / 2 < 0 ) {
				setLeftFixed();

			//                       +---Viewport-------------------------+
			//                       |                                    |
			//                       | +---Content----------------------+ |
			//                       | |                                | |
			//                       | |    +-----Notification-----+    | |
			//                       | |                                | |
			//                       | |                                | |
			//                       | +--------------------------------+ |
			//                       |                                    |
			//                       +------------------------------------+
			} else {
				setCenter();
			}
		}

		function setLeft() {
			area.setStyle( 'left', cssLength( leftBase ) );
		}

		function setLeftFixed() {
			area.setStyle( 'left', cssLength( leftBase - contentsPos.x + scrollPos.x ) );
		}

		function setCenter() {
			area.setStyle( 'left', cssLength( leftBase + contentsRect.width / 2 - notificationWidth / 2 - notificationMargin / 2 ) );
		}

		function setRight() {
			area.setStyle( 'left', cssLength( leftBase + contentsRect.width - notificationWidth - notificationMargin ) );
		}

		function setRightFixed() {
			area.setStyle( 'left', cssLength( leftBase - contentsPos.x + scrollPos.x + viewRect.width -
				notificationWidth - notificationMargin ) );
		}
	}
};

CKEDITOR.plugins.notification = Notification;








