



( function() {
	
	CKEDITOR.focusManager = function( editor ) {
		if ( editor.focusManager )
			return editor.focusManager;

		
		this.hasFocus = false;

		
		this.currentActive = null;

		
		this._ = {
			editor: editor
		};

		return this;
	};

	var SLOT_NAME = 'focusmanager',
		SLOT_NAME_LISTENERS = 'focusmanager_handlers';

	
	CKEDITOR.focusManager._ = {
		
		blurDelay: 200
	};

	CKEDITOR.focusManager.prototype = {

		
		focus: function( currentActive ) {
			if ( this._.timer )
				clearTimeout( this._.timer );

			if ( currentActive )
				this.currentActive = currentActive;

			if ( !( this.hasFocus || this._.locked ) ) {
				// If another editor has the current focus, we first "blur" it. In
				// this way the events happen in a more logical sequence, like:
				//		"focus 1" > "blur 1" > "focus 2"
				// ... instead of:
				//		"focus 1" > "focus 2" > "blur 1"
				var current = CKEDITOR.currentInstance;
				current && current.focusManager.blur( 1 );

				this.hasFocus = true;

				var ct = this._.editor.container;
				ct && ct.addClass( 'cke_focus' );
				this._.editor.fire( 'focus' );
			}
		},

		
		lock: function() {
			this._.locked = 1;
		},

		
		unlock: function() {
			delete this._.locked;
		},

		
		blur: function( noDelay ) {
			if ( this._.locked )
				return;

			function doBlur() {
				if ( this.hasFocus ) {
					this.hasFocus = false;

					var ct = this._.editor.container;
					ct && ct.removeClass( 'cke_focus' );
					this._.editor.fire( 'blur' );
				}
			}

			if ( this._.timer )
				clearTimeout( this._.timer );

			var delay = CKEDITOR.focusManager._.blurDelay;
			if ( noDelay || !delay )
				doBlur.call( this );
			else {
				this._.timer = CKEDITOR.tools.setTimeout( function() {
					delete this._.timer;
					doBlur.call( this );
				}, delay, this );
			}
		},

		
		add: function( element, isCapture ) {
			var fm = element.getCustomData( SLOT_NAME );
			if ( !fm || fm != this ) {
				// If this element is already taken by another instance, dismiss it first.
				fm && fm.remove( element );

				var focusEvent = 'focus',
					blurEvent = 'blur';

				// Bypass the element's internal DOM focus change.
				if ( isCapture ) {

					// Use "focusin/focusout" events instead of capture phase in IEs,
					// which fires synchronously.
					if ( CKEDITOR.env.ie ) {
						focusEvent = 'focusin';
						blurEvent = 'focusout';
					} else {
						CKEDITOR.event.useCapture = 1;
					}
				}

				var listeners = {
					blur: function() {
						if ( element.equals( this.currentActive ) )
							this.blur();
					},
					focus: function() {
						this.focus( element );
					}
				};

				element.on( focusEvent, listeners.focus, this );
				element.on( blurEvent, listeners.blur, this );

				if ( isCapture )
					CKEDITOR.event.useCapture = 0;

				element.setCustomData( SLOT_NAME, this );
				element.setCustomData( SLOT_NAME_LISTENERS, listeners );
			}
		},

		
		remove: function( element ) {
			element.removeCustomData( SLOT_NAME );
			var listeners = element.removeCustomData( SLOT_NAME_LISTENERS );
			element.removeListener( 'blur', listeners.blur );
			element.removeListener( 'focus', listeners.focus );
		}

	};

} )();




