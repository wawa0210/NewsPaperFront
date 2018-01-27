



'use strict';

( function() {
	var DRAG_HANDLER_SIZE = 15;

	CKEDITOR.plugins.add( 'widget', {
		// jscs:disable maximumLineLength
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		requires: 'lineutils,clipboard',
		onLoad: function() {
			CKEDITOR.addCss(
				'.cke_widget_wrapper{' +
					'position:relative;' +
					'outline:none' +
				'}' +
				'.cke_widget_inline{' +
					'display:inline-block' +
				'}' +
				'.cke_widget_wrapper:hover>.cke_widget_element{' +
					'outline:2px solid yellow;' +
					'cursor:default' +
				'}' +
				'.cke_widget_wrapper:hover .cke_widget_editable{' +
					'outline:2px solid yellow' +
				'}' +
				'.cke_widget_wrapper.cke_widget_focused>.cke_widget_element,' +
				// We need higher specificity than hover style.
				'.cke_widget_wrapper .cke_widget_editable.cke_widget_editable_focused{' +
					'outline:2px solid #ace' +
				'}' +
				'.cke_widget_editable{' +
					'cursor:text' +
				'}' +
				'.cke_widget_drag_handler_container{' +
					'position:absolute;' +
					'width:' + DRAG_HANDLER_SIZE + 'px;' +
					'height:0;' +
					// Initially drag handler should not be visible, until its position will be
					// calculated (#11177).
					// We need to hide unpositined handlers, so they don't extend
					// widget's outline far to the left (#12024).
					'display:none;' +
					'opacity:0.75;' +
					'transition:height 0s 0.2s;' + // Delay hiding drag handler.
					// Prevent drag handler from being misplaced (#11198).
					'line-height:0' +
				'}' +
				'.cke_widget_wrapper:hover>.cke_widget_drag_handler_container{' +
					'height:' + DRAG_HANDLER_SIZE + 'px;' +
					'transition:none' +
				'}' +
				'.cke_widget_drag_handler_container:hover{' +
					'opacity:1' +
				'}' +
				'img.cke_widget_drag_handler{' +
					'cursor:move;' +
					'width:' + DRAG_HANDLER_SIZE + 'px;' +
					'height:' + DRAG_HANDLER_SIZE + 'px;' +
					'display:inline-block' +
				'}' +
				'.cke_widget_mask{' +
					'position:absolute;' +
					'top:0;' +
					'left:0;' +
					'width:100%;' +
					'height:100%;' +
					'display:block' +
				'}' +
				'.cke_editable.cke_widget_dragging, .cke_editable.cke_widget_dragging *{' +
					'cursor:move !important' +
				'}'
			);
		},

		beforeInit: function( editor ) {
			
			editor.widgets = new Repository( editor );
		},

		afterInit: function( editor ) {
			addWidgetButtons( editor );
			setupContextMenu( editor );
		}
	} );

	
	function Repository( editor ) {
		
		this.editor = editor;

		
		this.registered = {};

		
		this.instances = {};

		
		this.selected = [];

		
		this.focused = null;

		
		this.widgetHoldingFocusedEditable = null;

		this._ = {
			nextId: 0,
			upcasts: [],
			upcastCallbacks: [],
			filters: {}
		};

		setupWidgetsLifecycle( this );
		setupSelectionObserver( this );
		setupMouseObserver( this );
		setupKeyboardObserver( this );
		setupDragAndDrop( this );
		setupNativeCutAndCopy( this );
	}

	Repository.prototype = {
		
		MIN_SELECTION_CHECK_INTERVAL: 500,

		
		add: function( name, widgetDef ) {
			// Create prototyped copy of original widget definition, so we won't modify it.
			widgetDef = CKEDITOR.tools.prototypedCopy( widgetDef );
			widgetDef.name = name;

			widgetDef._ = widgetDef._ || {};

			this.editor.fire( 'widgetDefinition', widgetDef );

			if ( widgetDef.template )
				widgetDef.template = new CKEDITOR.template( widgetDef.template );

			addWidgetCommand( this.editor, widgetDef );
			addWidgetProcessors( this, widgetDef );

			this.registered[ name ] = widgetDef;

			return widgetDef;
		},

		
		addUpcastCallback: function( callback ) {
			this._.upcastCallbacks.push( callback );
		},

		
		checkSelection: function() {
			var sel = this.editor.getSelection(),
				selectedElement = sel.getSelectedElement(),
				updater = stateUpdater( this ),
				widget;

			// Widget is focused so commit and finish checking.
			if ( selectedElement && ( widget = this.getByElement( selectedElement, true ) ) )
				return updater.focus( widget ).select( widget ).commit();

			var range = sel.getRanges()[ 0 ];

			// No ranges or collapsed range mean that nothing is selected, so commit and finish checking.
			if ( !range || range.collapsed )
				return updater.commit();

			// Range is not empty, so create walker checking for wrappers.
			var walker = new CKEDITOR.dom.walker( range ),
				wrapper;

			walker.evaluator = Widget.isDomWidgetWrapper;

			while ( ( wrapper = walker.next() ) )
				updater.select( this.getByElement( wrapper ) );

			updater.commit();
		},

		
		checkWidgets: function( options ) {
			this.fire( 'checkWidgets', CKEDITOR.tools.copy( options || {} ) );
		},

		
		del: function( widget ) {
			if ( this.focused === widget ) {
				var editor = widget.editor,
					range = editor.createRange(),
					found;

				// If haven't found place for caret on the default side,
				// try to find it on the other side.
				if ( !( found = range.moveToClosestEditablePosition( widget.wrapper, true ) ) )
					found = range.moveToClosestEditablePosition( widget.wrapper, false );

				if ( found )
					editor.getSelection().selectRanges( [ range ] );
			}

			widget.wrapper.remove();
			this.destroy( widget, true );
		},

		
		destroy: function( widget, offline ) {
			if ( this.widgetHoldingFocusedEditable === widget )
				setFocusedEditable( this, widget, null, offline );

			widget.destroy( offline );
			delete this.instances[ widget.id ];
			this.fire( 'instanceDestroyed', widget );
		},

		
		destroyAll: function( offline, container ) {
			var widget,
				id,
				instances = this.instances;

			if ( container && !offline ) {
				var wrappers = container.find( '.cke_widget_wrapper' ),
					l = wrappers.count(),
					i = 0;

				// Length is constant, because this is not a live node list.
				// Note: since querySelectorAll returns nodes in document order,
				// outer widgets are always placed before their nested widgets and therefore
				// are destroyed before them.
				for ( ; i < l; ++i ) {
					widget = this.getByElement( wrappers.getItem( i ), true );
					// Widget might not be found, because it could be a nested widget,
					// which would be destroyed when destroying its parent.
					if ( widget )
						this.destroy( widget );
				}

				return;
			}

			for ( id in instances ) {
				widget = instances[ id ];
				this.destroy( widget, offline );
			}
		},

		
		finalizeCreation: function( container ) {
			var wrapper = container.getFirst();
			if ( wrapper && Widget.isDomWidgetWrapper( wrapper ) ) {
				this.editor.insertElement( wrapper );

				var widget = this.getByElement( wrapper );
				// Fire postponed #ready event.
				widget.ready = true;
				widget.fire( 'ready' );
				widget.focus();
			}
		},

		
		getByElement: ( function() {
			var validWrapperElements = { div: 1, span: 1 };
			function getWidgetId( element ) {
				return element.is( validWrapperElements ) && element.data( 'cke-widget-id' );
			}

			return function( element, checkWrapperOnly ) {
				if ( !element )
					return null;

				var id = getWidgetId( element );

				// There's no need to check element parents if element is a wrapper.
				if ( !checkWrapperOnly && !id ) {
					var limit = this.editor.editable();

					// Try to find a closest ascendant which is a widget wrapper.
					do {
						element = element.getParent();
					} while ( element && !element.equals( limit ) && !( id = getWidgetId( element ) ) );
				}

				return this.instances[ id ] || null;
			};
		} )(),

		
		initOn: function( element, widgetDef, startupData ) {
			if ( !widgetDef )
				widgetDef = this.registered[ element.data( 'widget' ) ];
			else if ( typeof widgetDef == 'string' )
				widgetDef = this.registered[ widgetDef ];

			if ( !widgetDef )
				return null;

			// Wrap element if still wasn't wrapped (was added during runtime by method that skips dataProcessor).
			var wrapper = this.wrapElement( element, widgetDef.name );

			if ( wrapper ) {
				// Check if widget wrapper is new (widget hasn't been initialized on it yet).
				// This class will be removed by widget constructor to avoid locking snapshot twice.
				if ( wrapper.hasClass( 'cke_widget_new' ) ) {
					var widget = new Widget( this, this._.nextId++, element, widgetDef, startupData );

					// Widget could be destroyed when initializing it.
					if ( widget.isInited() ) {
						this.instances[ widget.id ] = widget;

						return widget;
					} else {
						return null;
					}
				}

				// Widget already has been initialized, so try to get widget by element.
				// Note - it may happen that other instance will returned than the one created above,
				// if for example widget was destroyed and reinitialized.
				return this.getByElement( element );
			}

			// No wrapper means that there's no widget for this element.
			return null;
		},

		
		initOnAll: function( container ) {
			var newWidgets = ( container || this.editor.editable() ).find( '.cke_widget_new' ),
				newInstances = [],
				instance;

			for ( var i = newWidgets.count(); i--; ) {
				instance = this.initOn( newWidgets.getItem( i ).getFirst( Widget.isDomWidgetElement ) );
				if ( instance )
					newInstances.push( instance );
			}

			return newInstances;
		},

		
		onWidget: function( widgetName ) {
			var args = Array.prototype.slice.call( arguments );

			args.shift();

			for ( var i in this.instances ) {
				var instance = this.instances[ i ];

				if ( instance.name == widgetName ) {
					instance.on.apply( instance, args );
				}
			}

			this.on( 'instanceCreated', function( evt ) {
				var widget = evt.data;

				if ( widget.name == widgetName ) {
					widget.on.apply( widget, args );
				}
			} );
		},

		
		parseElementClasses: function( classes ) {
			if ( !classes )
				return null;

			classes = CKEDITOR.tools.trim( classes ).split( /\s+/ );

			var cl,
				obj = {},
				hasClasses = 0;

			while ( ( cl = classes.pop() ) ) {
				if ( cl.indexOf( 'cke_' ) == -1 )
					obj[ cl ] = hasClasses = 1;
			}

			return hasClasses ? obj : null;
		},

		
		wrapElement: function( element, widgetName ) {
			var wrapper = null,
				widgetDef,
				isInline;

			if ( element instanceof CKEDITOR.dom.element ) {
				widgetDef = this.registered[ widgetName || element.data( 'widget' ) ];
				if ( !widgetDef )
					return null;

				// Do not wrap already wrapped element.
				wrapper = element.getParent();
				if ( wrapper && wrapper.type == CKEDITOR.NODE_ELEMENT && wrapper.data( 'cke-widget-wrapper' ) )
					return wrapper;

				// If attribute isn't already set (e.g. for pasted widget), set it.
				if ( !element.hasAttribute( 'data-cke-widget-keep-attr' ) )
					element.data( 'cke-widget-keep-attr', element.data( 'widget' ) ? 1 : 0 );
				if ( widgetName )
					element.data( 'widget', widgetName );

				isInline = isWidgetInline( widgetDef, element.getName() );

				wrapper = new CKEDITOR.dom.element( isInline ? 'span' : 'div' );
				wrapper.setAttributes( getWrapperAttributes( isInline ) );

				wrapper.data( 'cke-display-name', widgetDef.pathName ? widgetDef.pathName : element.getName() );

				// Replace element unless it is a detached one.
				if ( element.getParent( true ) )
					wrapper.replace( element );
				element.appendTo( wrapper );
			}
			else if ( element instanceof CKEDITOR.htmlParser.element ) {
				widgetDef = this.registered[ widgetName || element.attributes[ 'data-widget' ] ];
				if ( !widgetDef )
					return null;

				wrapper = element.parent;
				if ( wrapper && wrapper.type == CKEDITOR.NODE_ELEMENT && wrapper.attributes[ 'data-cke-widget-wrapper' ] )
					return wrapper;

				// If attribute isn't already set (e.g. for pasted widget), set it.
				if ( !( 'data-cke-widget-keep-attr' in element.attributes ) )
					element.attributes[ 'data-cke-widget-keep-attr' ] = element.attributes[ 'data-widget' ] ? 1 : 0;
				if ( widgetName )
					element.attributes[ 'data-widget' ] = widgetName;

				isInline = isWidgetInline( widgetDef, element.name );

				wrapper = new CKEDITOR.htmlParser.element( isInline ? 'span' : 'div', getWrapperAttributes( isInline ) );

				wrapper.attributes[ 'data-cke-display-name' ] = widgetDef.pathName ? widgetDef.pathName : element.name;

				var parent = element.parent,
					index;

				// Don't detach already detached element.
				if ( parent ) {
					index = element.getIndex();
					element.remove();
				}

				wrapper.add( element );

				// Insert wrapper fixing DOM (splitting parents if wrapper is not allowed inside them).
				parent && insertElement( parent, index, wrapper );
			}

			return wrapper;
		},

		// Expose for tests.
		_tests_createEditableFilter: createEditableFilter
	};

	CKEDITOR.event.implementOn( Repository.prototype );

	

	

	

	


	
	function Widget( widgetsRepo, id, element, widgetDef, startupData ) {
		var editor = widgetsRepo.editor;

		// Extend this widget with widgetDef-specific methods and properties.
		CKEDITOR.tools.extend( this, widgetDef, {
			
			editor: editor,

			
			id: id,

			
			inline: element.getParent().getName() == 'span',

			
			element: element,

			
			data: CKEDITOR.tools.extend( {}, typeof widgetDef.defaults == 'function' ? widgetDef.defaults() : widgetDef.defaults ),

			
			dataReady: false,

			
			inited: false,

			
			ready: false,

			// Revert what widgetDef could override (automatic #edit listener).
			edit: Widget.prototype.edit,

			
			focusedEditable: null,

			
			definition: widgetDef,

			
			repository: widgetsRepo,

			draggable: widgetDef.draggable !== false,

			// WAAARNING: Overwrite widgetDef's priv object, because otherwise violent unicorn's gonna visit you.
			_: {
				downcastFn: ( widgetDef.downcast && typeof widgetDef.downcast == 'string' ) ?
					widgetDef.downcasts[ widgetDef.downcast ] : widgetDef.downcast
			}
		}, true );

		

		

		

		widgetsRepo.fire( 'instanceCreated', this );

		setupWidget( this, widgetDef );

		this.init && this.init();

		// Finally mark widget as inited.
		this.inited = true;

		setupWidgetData( this, startupData );

		// If at some point (e.g. in #data listener) widget hasn't been destroyed
		// and widget is already attached to document then fire #ready.
		if ( this.isInited() && editor.editable().contains( this.wrapper ) ) {
			this.ready = true;
			this.fire( 'ready' );
		}
	}

	Widget.prototype = {
		
		addClass: function( className ) {
			this.element.addClass( className );
		},

		
		applyStyle: function( style ) {
			applyRemoveStyle( this, style, 1 );
		},

		
		checkStyleActive: function( style ) {
			var classes = getStyleClasses( style ),
				cl;

			if ( !classes )
				return false;

			while ( ( cl = classes.pop() ) ) {
				if ( !this.hasClass( cl ) )
					return false;
			}
			return true;
		},

		
		destroy: function( offline ) {
			this.fire( 'destroy' );

			if ( this.editables ) {
				for ( var name in this.editables )
					this.destroyEditable( name, offline );
			}

			if ( !offline ) {
				if ( this.element.data( 'cke-widget-keep-attr' ) == '0' )
					this.element.removeAttribute( 'data-widget' );
				this.element.removeAttributes( [ 'data-cke-widget-data', 'data-cke-widget-keep-attr' ] );
				this.element.removeClass( 'cke_widget_element' );
				this.element.replace( this.wrapper );
			}

			this.wrapper = null;
		},

		
		destroyEditable: function( editableName, offline ) {
			var editable = this.editables[ editableName ];

			editable.removeListener( 'focus', onEditableFocus );
			editable.removeListener( 'blur', onEditableBlur );
			this.editor.focusManager.remove( editable );

			if ( !offline ) {
				this.repository.destroyAll( false, editable );
				editable.removeClass( 'cke_widget_editable' );
				editable.removeClass( 'cke_widget_editable_focused' );
				editable.removeAttributes( [ 'contenteditable', 'data-cke-widget-editable', 'data-cke-enter-mode' ] );
			}

			delete this.editables[ editableName ];
		},

		
		edit: function() {
			var evtData = { dialog: this.dialog },
				that = this;

			// Edit event was blocked or there's no dialog to be automatically opened.
			if ( this.fire( 'edit', evtData ) === false || !evtData.dialog )
				return false;

			this.editor.openDialog( evtData.dialog, function( dialog ) {
				var showListener,
					okListener;

				// Allow to add a custom dialog handler.
				if ( that.fire( 'dialog', dialog ) === false )
					return;

				showListener = dialog.on( 'show', function() {
					dialog.setupContent( that );
				} );

				okListener = dialog.on( 'ok', function() {
					// Commit dialog's fields, but prevent from
					// firing data event for every field. Fire only one,
					// bulk event at the end.
					var dataChanged,
						dataListener = that.on( 'data', function( evt ) {
							dataChanged = 1;
							evt.cancel();
						}, null, null, 0 );

					// Create snapshot preceeding snapshot with changed widget...
					// TODO it should not be required, but it is and I found similar
					// code in dialog#ok listener in dialog/plugin.js.
					that.editor.fire( 'saveSnapshot' );
					dialog.commitContent( that );

					dataListener.removeListener();
					if ( dataChanged ) {
						that.fire( 'data', that.data );
						that.editor.fire( 'saveSnapshot' );
					}
				} );

				dialog.once( 'hide', function() {
					showListener.removeListener();
					okListener.removeListener();
				} );
			} );

			return true;
		},

		
		getClasses: function() {
			return this.repository.parseElementClasses( this.element.getAttribute( 'class' ) );
		},

		
		hasClass: function( className ) {
			return this.element.hasClass( className );
		},

		
		initEditable: function( editableName, definition ) {
			// Don't fetch just first element which matched selector but look for a correct one. (#13334)
			var editable = this._findOneNotNested( definition.selector );

			if ( editable && editable.is( CKEDITOR.dtd.$editable ) ) {
				editable = new NestedEditable( this.editor, editable, {
					filter: createEditableFilter.call( this.repository, this.name, editableName, definition )
				} );
				this.editables[ editableName ] = editable;

				editable.setAttributes( {
					contenteditable: 'true',
					'data-cke-widget-editable': editableName,
					'data-cke-enter-mode': editable.enterMode
				} );

				if ( editable.filter )
					editable.data( 'cke-filter', editable.filter.id );

				editable.addClass( 'cke_widget_editable' );
				// This class may be left when d&ding widget which
				// had focused editable. Clean this class here, not in
				// cleanUpWidgetElement for performance and code size reasons.
				editable.removeClass( 'cke_widget_editable_focused' );

				if ( definition.pathName )
					editable.data( 'cke-display-name', definition.pathName );

				this.editor.focusManager.add( editable );
				editable.on( 'focus', onEditableFocus, this );
				CKEDITOR.env.ie && editable.on( 'blur', onEditableBlur, this );

				// Finally, process editable's data. This data wasn't processed when loading
				// editor's data, becuase they need to be processed separately, with its own filters and settings.
				editable._.initialSetData = true;
				editable.setData( editable.getHtml() );

				return true;
			}

			return false;
		},

		
		_findOneNotNested: function( selector ) {
			var matchedElements = this.wrapper.find( selector ),
				match,
				closestWrapper;

			for ( var i = 0; i < matchedElements.count(); i++ ) {
				match = matchedElements.getItem( i );
				closestWrapper = match.getAscendant( Widget.isDomWidgetWrapper );

				// The closest ascendant-wrapper of this match defines to which widget
				// this match belongs. If the ascendant is this widget's wrapper
				// it means that the match is not nested in other widget.
				if ( this.wrapper.equals( closestWrapper ) ) {
					return match;
				}
			}

			return null;
		},

		
		isInited: function() {
			return !!( this.wrapper && this.inited );
		},

		
		isReady: function() {
			return this.isInited() && this.ready;
		},

		
		focus: function() {
			var sel = this.editor.getSelection();

			// Fake the selection before focusing editor, to avoid unpreventable viewports scrolling
			// on Webkit/Blink/IE which is done because there's no selection or selection was somewhere else than widget.
			if ( sel ) {
				var isDirty = this.editor.checkDirty();

				sel.fake( this.wrapper );

				!isDirty && this.editor.resetDirty();
			}

			// Always focus editor (not only when focusManger.hasFocus is false) (because of #10483).
			this.editor.focus();
		},

		
		removeClass: function( className ) {
			this.element.removeClass( className );
		},

		
		removeStyle: function( style ) {
			applyRemoveStyle( this, style, 0 );
		},

		
		setData: function( key, value ) {
			var data = this.data,
				modified = 0;

			if ( typeof key == 'string' ) {
				if ( data[ key ] !== value ) {
					data[ key ] = value;
					modified = 1;
				}
			}
			else {
				var newData = key;

				for ( key in newData ) {
					if ( data[ key ] !== newData[ key ] ) {
						modified = 1;
						data[ key ] = newData[ key ];
					}
				}
			}

			// Block firing data event and overwriting data element before setupWidgetData is executed.
			if ( modified && this.dataReady ) {
				writeDataToElement( this );
				this.fire( 'data', data );
			}

			return this;
		},

		
		setFocused: function( focused ) {
			this.wrapper[ focused ? 'addClass' : 'removeClass' ]( 'cke_widget_focused' );
			this.fire( focused ? 'focus' : 'blur' );
			return this;
		},

		
		setSelected: function( selected ) {
			this.wrapper[ selected ? 'addClass' : 'removeClass' ]( 'cke_widget_selected' );
			this.fire(  selected ? 'select' : 'deselect' );
			return this;
		},

		
		updateDragHandlerPosition: function() {
			var editor = this.editor,
				domElement = this.element.$,
				oldPos = this._.dragHandlerOffset,
				newPos = {
					x: domElement.offsetLeft,
					y: domElement.offsetTop - DRAG_HANDLER_SIZE
				};

			if ( oldPos && newPos.x == oldPos.x && newPos.y == oldPos.y )
				return;

			// We need to make sure that dirty state is not changed (#11487).
			var initialDirty = editor.checkDirty();

			editor.fire( 'lockSnapshot' );
			this.dragHandlerContainer.setStyles( {
				top: newPos.y + 'px',
				left: newPos.x + 'px',
				display: 'block'
			} );
			editor.fire( 'unlockSnapshot' );
			!initialDirty && editor.resetDirty();

			this._.dragHandlerOffset = newPos;
		}
	};

	CKEDITOR.event.implementOn( Widget.prototype );

	
	Widget.getNestedEditable = function( guard, node ) {
		if ( !node || node.equals( guard ) )
			return null;

		if ( Widget.isDomNestedEditable( node ) )
			return node;

		return Widget.getNestedEditable( guard, node.getParent() );
	};

	
	Widget.isDomDragHandler = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && node.hasAttribute( 'data-cke-widget-drag-handler' );
	};

	
	Widget.isDomDragHandlerContainer = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && node.hasClass( 'cke_widget_drag_handler_container' );
	};

	
	Widget.isDomNestedEditable = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && node.hasAttribute( 'data-cke-widget-editable' );
	};

	
	Widget.isDomWidgetElement = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && node.hasAttribute( 'data-widget' );
	};

	
	Widget.isDomWidgetWrapper = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && node.hasAttribute( 'data-cke-widget-wrapper' );
	};

	
	Widget.isParserWidgetElement = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && !!node.attributes[ 'data-widget' ];
	};

	
	Widget.isParserWidgetWrapper = function( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT && !!node.attributes[ 'data-cke-widget-wrapper' ];
	};

	

	

	

	

	

	

	

	

	

	

	

	



	
	function NestedEditable( editor, element, config ) {
		// Call the base constructor.
		CKEDITOR.dom.element.call( this, element.$ );
		this.editor = editor;
		this._ = {};
		var filter = this.filter = config.filter;

		// If blockless editable - always use BR mode.
		if ( !CKEDITOR.dtd[ this.getName() ].p )
			this.enterMode = this.shiftEnterMode = CKEDITOR.ENTER_BR;
		else {
			this.enterMode = filter ? filter.getAllowedEnterMode( editor.enterMode ) : editor.enterMode;
			this.shiftEnterMode = filter ? filter.getAllowedEnterMode( editor.shiftEnterMode, true ) : editor.shiftEnterMode;
		}
	}

	NestedEditable.prototype = CKEDITOR.tools.extend( CKEDITOR.tools.prototypedCopy( CKEDITOR.dom.element.prototype ), {
		
		setData: function( data ) {
			// For performance reasons don't call destroyAll when initializing a nested editable,
			// because there are no widgets inside.
			if ( !this._.initialSetData ) {
				// Destroy all nested widgets before setting data.
				this.editor.widgets.destroyAll( false, this );
			}
			this._.initialSetData = false;

			data = this.editor.dataProcessor.toHtml( data, {
				context: this.getName(),
				filter: this.filter,
				enterMode: this.enterMode
			} );
			this.setHtml( data );

			this.editor.widgets.initOnAll( this );
		},

		
		getData: function() {
			return this.editor.dataProcessor.toDataFormat( this.getHtml(), {
				context: this.getName(),
				filter: this.filter,
				enterMode: this.enterMode
			} );
		}
	} );

	

	

	

	


	//
	// REPOSITORY helpers -----------------------------------------------------
	//

	function addWidgetButtons( editor ) {
		var widgets = editor.widgets.registered,
			widget,
			widgetName,
			widgetButton;

		for ( widgetName in widgets ) {
			widget = widgets[ widgetName ];

			// Create button if defined.
			widgetButton = widget.button;
			if ( widgetButton && editor.ui.addButton ) {
				editor.ui.addButton( CKEDITOR.tools.capitalize( widget.name, true ), {
					label: widgetButton,
					command: widget.name,
					toolbar: 'insert,10'
				} );
			}
		}
	}

	// Create a command creating and editing widget.
	//
	// @param editor
	// @param {CKEDITOR.plugins.widget.definition} widgetDef
	function addWidgetCommand( editor, widgetDef ) {
		editor.addCommand( widgetDef.name, {
			exec: function( editor, commandData ) {
				var focused = editor.widgets.focused;
				// If a widget of the same type is focused, start editing.
				if ( focused && focused.name == widgetDef.name )
					focused.edit();
				// Otherwise...
				// ... use insert method is was defined.
				else if ( widgetDef.insert )
					widgetDef.insert();
				// ... or create a brand-new widget from template.
				else if ( widgetDef.template ) {
					var defaults = typeof widgetDef.defaults == 'function' ? widgetDef.defaults() : widgetDef.defaults,
						element = CKEDITOR.dom.element.createFromHtml( widgetDef.template.output( defaults ) ),
						instance,
						wrapper = editor.widgets.wrapElement( element, widgetDef.name ),
						temp = new CKEDITOR.dom.documentFragment( wrapper.getDocument() );

					// Append wrapper to a temporary document. This will unify the environment
					// in which #data listeners work when creating and editing widget.
					temp.append( wrapper );
					instance = editor.widgets.initOn( element, widgetDef, commandData && commandData.startupData );

					// Instance could be destroyed during initialization.
					// In this case finalize creation if some new widget
					// was left in temporary document fragment.
					if ( !instance ) {
						finalizeCreation();
						return;
					}

					// Listen on edit to finalize widget insertion.
					//
					// * If dialog was set, then insert widget after dialog was successfully saved or destroy this
					// temporary instance.
					// * If dialog wasn't set and edit wasn't canceled, insert widget.
					var editListener = instance.once( 'edit', function( evt ) {
						if ( evt.data.dialog ) {
							instance.once( 'dialog', function( evt ) {
								var dialog = evt.data,
									okListener,
									cancelListener;

								// Finalize creation AFTER (20) new data was set.
								okListener = dialog.once( 'ok', finalizeCreation, null, null, 20 );

								cancelListener = dialog.once( 'cancel', function( evt ) {
									if ( !( evt.data && evt.data.hide === false ) ) {
										editor.widgets.destroy( instance, true );
									}
								} );

								dialog.once( 'hide', function() {
									okListener.removeListener();
									cancelListener.removeListener();
								} );
							} );
						} else {
							// Dialog hasn't been set, so insert widget now.
							finalizeCreation();
						}
					}, null, null, 999 );

					instance.edit();

					// Remove listener in case someone canceled it before this
					// listener was executed.
					editListener.removeListener();
				}

				function finalizeCreation() {
					editor.widgets.finalizeCreation( temp );
				}
			},

			allowedContent: widgetDef.allowedContent,
			requiredContent: widgetDef.requiredContent,
			contentForms: widgetDef.contentForms,
			contentTransformations: widgetDef.contentTransformations
		} );
	}

	function addWidgetProcessors( widgetsRepo, widgetDef ) {
		var upcast = widgetDef.upcast,
			upcasts,
			priority = widgetDef.upcastPriority || 10;

		if ( !upcast )
			return;

		// Multiple upcasts defined in string.
		if ( typeof upcast == 'string' ) {
			upcasts = upcast.split( ',' );
			while ( upcasts.length ) {
				addUpcast( widgetDef.upcasts[ upcasts.pop() ], widgetDef.name, priority );
			}
		}
		// Single rule which is automatically activated.
		else {
			addUpcast( upcast, widgetDef.name, priority );
		}

		function addUpcast( upcast, name, priority ) {
			// Find index of the first higher (in terms of value) priority upcast.
			var index = CKEDITOR.tools.getIndex( widgetsRepo._.upcasts, function( element ) {
				return element[ 2 ] > priority;
			} );
			// Add at the end if it is the highest priority so far.
			if ( index < 0 ) {
				index = widgetsRepo._.upcasts.length;
			}

			widgetsRepo._.upcasts.splice( index, 0, [ upcast, name, priority ] );
		}
	}

	function blurWidget( widgetsRepo, widget ) {
		widgetsRepo.focused = null;

		if ( widget.isInited() ) {
			var isDirty = widget.editor.checkDirty();

			// Widget could be destroyed in the meantime - e.g. data could be set.
			widgetsRepo.fire( 'widgetBlurred', { widget: widget } );
			widget.setFocused( false );

			!isDirty && widget.editor.resetDirty();
		}
	}

	function checkWidgets( evt ) {
		var options = evt.data;

		if ( this.editor.mode != 'wysiwyg' )
			return;

		var editable = this.editor.editable(),
			instances = this.instances,
			newInstances, i, count, wrapper, notYetInitialized;

		if ( !editable )
			return;

		// Remove widgets which have no corresponding elements in DOM.
		for ( i in instances ) {
			// #13410 Remove widgets that are ready. This prevents from destroying widgets that are during loading process.
			if ( instances[ i ].isReady() && !editable.contains( instances[ i ].wrapper ) )
				this.destroy( instances[ i ], true );
		}

		// Init on all (new) if initOnlyNew option was passed.
		if ( options && options.initOnlyNew )
			newInstances = this.initOnAll();
		else {
			var wrappers = editable.find( '.cke_widget_wrapper' );
			newInstances = [];

			// Create widgets on existing wrappers if they do not exists.
			for ( i = 0, count = wrappers.count(); i < count; i++ ) {
				wrapper = wrappers.getItem( i );
				notYetInitialized = !this.getByElement( wrapper, true );

				// Check if:
				// * there's no instance for this widget
				// * wrapper is not inside some temporary element like copybin (#11088)
				// * it was a nested widget's wrapper which has been detached from DOM,
				// when nested editable has been initialized (it overwrites its innerHTML
				// and initializes nested widgets).
				if ( notYetInitialized && !findParent( wrapper, isDomTemp ) && editable.contains( wrapper ) ) {
					// Add cke_widget_new class because otherwise
					// widget will not be created on such wrapper.
					wrapper.addClass( 'cke_widget_new' );
					newInstances.push( this.initOn( wrapper.getFirst( Widget.isDomWidgetElement ) ) );
				}
			}
		}

		// If only single widget was initialized and focusInited was passed, focus it.
		if ( options && options.focusInited && newInstances.length == 1 )
			newInstances[ 0 ].focus();
	}

	// Unwraps widget element and clean up element.
	//
	// This function is used to clean up pasted widgets.
	// It should have similar result to widget#destroy plus
	// some additional adjustments, specific for pasting.
	//
	// @param {CKEDITOR.htmlParser.element} el
	function cleanUpWidgetElement( el ) {
		var parent = el.parent;
		if ( parent.type == CKEDITOR.NODE_ELEMENT && parent.attributes[ 'data-cke-widget-wrapper' ] )
			parent.replaceWith( el );
	}

	// Similar to cleanUpWidgetElement, but works on DOM and finds
	// widget elements by its own.
	//
	// Unlike cleanUpWidgetElement it will wrap element back.
	//
	// @param {CKEDITOR.dom.element} container
	function cleanUpAllWidgetElements( widgetsRepo, container ) {
		var wrappers = container.find( '.cke_widget_wrapper' ),
			wrapper, element,
			i = 0,
			l = wrappers.count();

		for ( ; i < l; ++i ) {
			wrapper = wrappers.getItem( i );
			element = wrapper.getFirst( Widget.isDomWidgetElement );
			// If wrapper contains widget element - unwrap it and wrap again.
			if ( element.type == CKEDITOR.NODE_ELEMENT && element.data( 'widget' ) ) {
				element.replace( wrapper );
				widgetsRepo.wrapElement( element );
			} else {
				// Otherwise - something is wrong... clean this up.
				wrapper.remove();
			}
		}
	}

	// Creates {@link CKEDITOR.filter} instance for given widget, editable and rules.
	//
	// Once filter for widget-editable pair is created it is cached, so the same instance
	// will be returned when method is executed again.
	//
	// @param {String} widgetName
	// @param {String} editableName
	// @param {CKEDITOR.plugins.widget.nestedEditableDefinition} editableDefinition The nested editable definition.
	// @returns {CKEDITOR.filter} Filter instance or `null` if rules are not defined.
	// @context CKEDITOR.plugins.widget.repository
	function createEditableFilter( widgetName, editableName, editableDefinition ) {
		if ( !editableDefinition.allowedContent )
			return null;

		var editables = this._.filters[ widgetName ];

		if ( !editables )
			this._.filters[ widgetName ] = editables = {};

		var filter = editables[ editableName ];

		if ( !filter )
			editables[ editableName ] = filter = new CKEDITOR.filter( editableDefinition.allowedContent );

		return filter;
	}

	// Creates an iterator function which when executed on all
	// elements in DOM tree will gather elements that should be wrapped
	// and initialized as widgets.
	function createUpcastIterator( widgetsRepo ) {
		var toBeWrapped = [],
			upcasts = widgetsRepo._.upcasts,
			upcastCallbacks = widgetsRepo._.upcastCallbacks;

		return {
			toBeWrapped: toBeWrapped,

			iterator: function( element ) {
				var upcast, upcasted,
					data,
					i,
					upcastsLength,
					upcastCallbacksLength;

				// Wrapper found - find widget element, add it to be
				// cleaned up (unwrapped) and wrapped and stop iterating in this branch.
				if ( 'data-cke-widget-wrapper' in element.attributes ) {
					element = element.getFirst( Widget.isParserWidgetElement );

					if ( element )
						toBeWrapped.push( [ element ] );

					// Do not iterate over descendants.
					return false;
				}
				// Widget element found - add it to be cleaned up (just in case)
				// and wrapped and stop iterating in this branch.
				else if ( 'data-widget' in element.attributes ) {
					toBeWrapped.push( [ element ] );

					// Do not iterate over descendants.
					return false;
				}
				else if ( ( upcastsLength = upcasts.length ) ) {
					// Ignore elements with data-cke-widget-upcasted to avoid multiple upcasts (#11533).
					// Do not iterate over descendants.
					if ( element.attributes[ 'data-cke-widget-upcasted' ] )
						return false;

					// Check element with upcast callbacks first.
					// If any of them return false abort upcasting.
					for ( i = 0, upcastCallbacksLength = upcastCallbacks.length; i < upcastCallbacksLength; ++i ) {
						if ( upcastCallbacks[ i ]( element ) === false )
							return;
						// Return nothing in order to continue iterating over ascendants.
						// See http://dev.ckeditor.com/ticket/11186#comment:6
					}

					for ( i = 0; i < upcastsLength; ++i ) {
						upcast = upcasts[ i ];
						data = {};

						if ( ( upcasted = upcast[ 0 ]( element, data ) ) ) {
							// If upcast function returned element, upcast this one.
							// It can be e.g. a new element wrapping the original one.
							if ( upcasted instanceof CKEDITOR.htmlParser.element )
								element = upcasted;

							// Set initial data attr with data from upcast method.
							element.attributes[ 'data-cke-widget-data' ] = encodeURIComponent( JSON.stringify( data ) );
							element.attributes[ 'data-cke-widget-upcasted' ] = 1;

							toBeWrapped.push( [ element, upcast[ 1 ] ] );

							// Do not iterate over descendants.
							return false;
						}
					}
				}
			}
		};
	}

	// Finds a first parent that matches query.
	//
	// @param {CKEDITOR.dom.element} element
	// @param {Function} query
	function findParent( element, query ) {
		var parent = element;

		while ( ( parent = parent.getParent() ) ) {
			if ( query( parent ) )
				return true;
		}
		return false;
	}

	function getWrapperAttributes( inlineWidget ) {
		return {
			// tabindex="-1" means that it can receive focus by code.
			tabindex: -1,
			contenteditable: 'false',
			'data-cke-widget-wrapper': 1,
			'data-cke-filter': 'off',
			// Class cke_widget_new marks widgets which haven't been initialized yet.
			'class': 'cke_widget_wrapper cke_widget_new cke_widget_' +
				( inlineWidget ? 'inline' : 'block' )
		};
	}

	// Inserts element at given index.
	// It will check DTD and split ancestor elements up to the first
	// that can contain this element.
	//
	// @param {CKEDITOR.htmlParser.element} parent
	// @param {Number} index
	// @param {CKEDITOR.htmlParser.element} element
	function insertElement( parent, index, element ) {
		// Do not split doc fragment...
		if ( parent.type == CKEDITOR.NODE_ELEMENT ) {
			var parentAllows = CKEDITOR.dtd[ parent.name ];
			// Parent element is known (included in DTD) and cannot contain
			// this element.
			if ( parentAllows && !parentAllows[ element.name ] ) {
				var parent2 = parent.split( index ),
					parentParent = parent.parent;

				// Element will now be inserted at right parent's index.
				index = parent2.getIndex();

				// If left part of split is empty - remove it.
				if ( !parent.children.length ) {
					index -= 1;
					parent.remove();
				}

				// If right part of split is empty - remove it.
				if ( !parent2.children.length )
					parent2.remove();

				// Try inserting as grandpas' children.
				return insertElement( parentParent, index, element );
			}
		}

		// Finally we can add this element.
		parent.add( element, index );
	}

	// Checks whether for the given widget definition and element widget should be created in inline or block mode.
	//
	// See also: {@link CKEDITOR.plugins.widget.definition#inline} and {@link CKEDITOR.plugins.widget#element}.
	//
	// @param {CKEDITOR.plugins.widget.definition} widgetDef The widget definition.
	// @param {String} elementName The name of the widget element.
	// @returns {Boolean}
	function isWidgetInline( widgetDef, elementName ) {
		return typeof widgetDef.inline == 'boolean' ? widgetDef.inline : !!CKEDITOR.dtd.$inline[ elementName ];
	}

	// @param {CKEDITOR.dom.element}
	// @returns {Boolean}
	function isDomTemp( element ) {
		return element.hasAttribute( 'data-cke-temp' );
	}

	function onEditableKey( widget, keyCode ) {
		var focusedEditable = widget.focusedEditable,
			range;

		// CTRL+A.
		if ( keyCode == CKEDITOR.CTRL + 65 ) {
			var bogus = focusedEditable.getBogus();

			range = widget.editor.createRange();
			range.selectNodeContents( focusedEditable );
			// Exclude bogus if exists.
			if ( bogus )
				range.setEndAt( bogus, CKEDITOR.POSITION_BEFORE_START );

			range.select();
			// Cancel event - block default.
			return false;
		}
		// DEL or BACKSPACE.
		else if ( keyCode == 8 || keyCode == 46 ) {
			var ranges = widget.editor.getSelection().getRanges();

			range = ranges[ 0 ];

			// Block del or backspace if at editable's boundary.
			return !( ranges.length == 1 && range.collapsed &&
				range.checkBoundaryOfElement( focusedEditable, CKEDITOR[ keyCode == 8 ? 'START' : 'END' ] ) );
		}
	}

	function setFocusedEditable( widgetsRepo, widget, editableElement, offline ) {
		var editor = widgetsRepo.editor;

		editor.fire( 'lockSnapshot' );

		if ( editableElement ) {
			var editableName = editableElement.data( 'cke-widget-editable' ),
				editableInstance = widget.editables[ editableName ];

			widgetsRepo.widgetHoldingFocusedEditable = widget;
			widget.focusedEditable = editableInstance;
			editableElement.addClass( 'cke_widget_editable_focused' );

			if ( editableInstance.filter )
				editor.setActiveFilter( editableInstance.filter );
			editor.setActiveEnterMode( editableInstance.enterMode, editableInstance.shiftEnterMode );
		} else {
			if ( !offline )
				widget.focusedEditable.removeClass( 'cke_widget_editable_focused' );

			widget.focusedEditable = null;
			widgetsRepo.widgetHoldingFocusedEditable = null;
			editor.setActiveFilter( null );
			editor.setActiveEnterMode( null, null );
		}

		editor.fire( 'unlockSnapshot' );
	}

	function setupContextMenu( editor ) {
		if ( !editor.contextMenu )
			return;

		editor.contextMenu.addListener( function( element ) {
			var widget = editor.widgets.getByElement( element, true );

			if ( widget )
				return widget.fire( 'contextMenu', {} );
		} );
	}

	// And now we've got two problems - original problem and RegExp.
	// Some softeners:
	// * FF tends to copy all blocks up to the copybin container.
	// * IE tends to copy only the copybin, without its container.
	// * We use spans on IE and blockless editors, but divs in other cases.
	var pasteReplaceRegex = new RegExp(
		'^' +
		'(?:<(?:div|span)(?: data-cke-temp="1")?(?: id="cke_copybin")?(?: data-cke-temp="1")?>)?' +
			'(?:<(?:div|span)(?: style="[^"]+")?>)?' +
				'<span [^>]*data-cke-copybin-start="1"[^>]*>.?</span>([\\s\\S]+)<span [^>]*data-cke-copybin-end="1"[^>]*>.?</span>' +
			'(?:</(?:div|span)>)?' +
		'(?:</(?:div|span)>)?' +
		'$',
		// IE8 prefers uppercase when browsers stick to lowercase HTML (#13460).
		'i'
	);

	function pasteReplaceFn( match, wrapperHtml ) {
		// Avoid polluting pasted data with any whitspaces,
		// what's going to break check whether only one widget was pasted.
		return CKEDITOR.tools.trim( wrapperHtml );
	}

	function setupDragAndDrop( widgetsRepo ) {
		var editor = widgetsRepo.editor,
			lineutils = CKEDITOR.plugins.lineutils;

		// These listeners handle inline and block widgets drag and drop.
		// The only thing we need to do to make block widgets custom drag and drop functionality
		// is to fire those events with the right properties (like the target which must be the drag handle).
		editor.on( 'dragstart', function( evt ) {
			var target = evt.data.target;

			if ( Widget.isDomDragHandler( target ) ) {
				var widget = widgetsRepo.getByElement( target );

				evt.data.dataTransfer.setData( 'cke/widget-id', widget.id );

				// IE needs focus.
				editor.focus();

				// and widget need to be focused on drag start (#12172#comment:10).
				widget.focus();
			}
		} );

		editor.on( 'drop', function( evt ) {
			var dataTransfer = evt.data.dataTransfer,
				id = dataTransfer.getData( 'cke/widget-id' ),
				transferType = dataTransfer.getTransferType( editor ),
				dragRange = editor.createRange(),
				sourceWidget;

			// Disable cross-editor drag & drop for widgets - #13599.
			if ( id !== '' && transferType === CKEDITOR.DATA_TRANSFER_CROSS_EDITORS ) {
				evt.cancel();
				return;
			}

			if ( id === '' || transferType != CKEDITOR.DATA_TRANSFER_INTERNAL ) {
				return;
			}

			sourceWidget = widgetsRepo.instances[ id ];
			if ( !sourceWidget ) {
				return;
			}

			dragRange.setStartBefore( sourceWidget.wrapper );
			dragRange.setEndAfter( sourceWidget.wrapper );
			evt.data.dragRange = dragRange;

			// [IE8-9] Reset state of the clipboard#fixSplitNodesAfterDrop fix because by setting evt.data.dragRange
			// (see above) after drop happened we do not need it. That fix is needed only if dragRange was created
			// before drop (before text node was split).
			delete CKEDITOR.plugins.clipboard.dragStartContainerChildCount;
			delete CKEDITOR.plugins.clipboard.dragEndContainerChildCount;

			evt.data.dataTransfer.setData( 'text/html', editor.editable().getHtmlFromRange( dragRange ).getHtml() );
			editor.widgets.destroy( sourceWidget, true );
		} );

		editor.on( 'contentDom', function() {
			var editable = editor.editable();

			// Register Lineutils's utilities as properties of repo.
			CKEDITOR.tools.extend( widgetsRepo, {
				finder: new lineutils.finder( editor, {
					lookups: {
						// Element is block but not list item and not in nested editable.
						'default': function( el ) {
							if ( el.is( CKEDITOR.dtd.$listItem ) )
								return;

							if ( !el.is( CKEDITOR.dtd.$block ) )
								return;

							// Allow drop line inside, but never before or after nested editable (#12006).
							if ( Widget.isDomNestedEditable( el ) )
								return;

							// Do not allow droping inside the widget being dragged (#13397).
							if ( widgetsRepo._.draggedWidget.wrapper.contains( el ) ) {
								return;
							}

							// If element is nested editable, make sure widget can be dropped there (#12006).
							var nestedEditable = Widget.getNestedEditable( editable, el );
							if ( nestedEditable ) {
								var draggedWidget = widgetsRepo._.draggedWidget;

								// Don't let the widget to be dropped into its own nested editable.
								if ( widgetsRepo.getByElement( nestedEditable ) == draggedWidget )
									return;

								var filter = CKEDITOR.filter.instances[ nestedEditable.data( 'cke-filter' ) ],
									draggedRequiredContent = draggedWidget.requiredContent;

								// There will be no relation if the filter of nested editable does not allow
								// requiredContent of dragged widget.
								if ( filter && draggedRequiredContent && !filter.check( draggedRequiredContent ) )
									return;
							}

							return CKEDITOR.LINEUTILS_BEFORE | CKEDITOR.LINEUTILS_AFTER;
						}
					}
				} ),
				locator: new lineutils.locator( editor ),
				liner: new lineutils.liner( editor, {
					lineStyle: {
						cursor: 'move !important',
						'border-top-color': '#666'
					},
					tipLeftStyle: {
						'border-left-color': '#666'
					},
					tipRightStyle: {
						'border-right-color': '#666'
					}
				} )
			}, true );
		} );
	}

	// Setup mouse observer which will trigger:
	// * widget focus on widget click,
	// * widget#doubleclick forwarded from editor#doubleclick.
	function setupMouseObserver( widgetsRepo ) {
		var editor = widgetsRepo.editor;

		editor.on( 'contentDom', function() {
			var editable = editor.editable(),
				evtRoot = editable.isInline() ? editable : editor.document,
				widget,
				mouseDownOnDragHandler;

			editable.attachListener( evtRoot, 'mousedown', function( evt ) {
				var target = evt.data.getTarget();

				// #10887 Clicking scrollbar in IE8 will invoke event with empty target object.
				if ( !target.type )
					return false;

				widget = widgetsRepo.getByElement( target );
				mouseDownOnDragHandler = 0; // Reset.

				// Widget was clicked, but not editable nested in it.
				if ( widget ) {
					// Ignore mousedown on drag and drop handler if the widget is inline.
					// Block widgets are handled by Lineutils.
					if ( widget.inline && target.type == CKEDITOR.NODE_ELEMENT && target.hasAttribute( 'data-cke-widget-drag-handler' ) ) {
						mouseDownOnDragHandler = 1;

						// When drag handler is pressed we have to clear current selection if it wasn't already on this widget.
						// Otherwise, the selection may be in a fillingChar, which prevents dragging a widget. (#13284, see comment 8 and 9.)
						if ( widgetsRepo.focused != widget )
							editor.getSelection().removeAllRanges();

						return;
					}

					if ( !Widget.getNestedEditable( widget.wrapper, target ) ) {
						evt.data.preventDefault();
						if ( !CKEDITOR.env.ie )
							widget.focus();
					} else {
						// Reset widget so mouseup listener is not confused.
						widget = null;
					}
				}
			} );

			// Focus widget on mouseup if mousedown was fired on drag handler.
			// Note: mouseup won't be fired at all if widget was dragged and dropped, so
			// this code will be executed only when drag handler was clicked.
			editable.attachListener( evtRoot, 'mouseup', function() {
				// Check if widget is not destroyed (if widget is destroyed the wrapper will be null).
				if ( mouseDownOnDragHandler && widget && widget.wrapper ) {
					mouseDownOnDragHandler = 0;
					widget.focus();
				}
			} );

			// On IE it is not enough to block mousedown. If widget wrapper (element with
			// contenteditable=false attribute) is clicked directly (it is a target),
			// then after mouseup/click IE will select that element.
			// It is not possible to prevent that default action,
			// so we force fake selection after everything happened.
			if ( CKEDITOR.env.ie ) {
				editable.attachListener( evtRoot, 'mouseup', function() {
					setTimeout( function() {
						// Check if widget is not destroyed (if widget is destroyed the wrapper will be null) and
						// in editable contains widget (it could be dragged and removed).
						if ( widget && widget.wrapper && editable.contains( widget.wrapper ) ) {
							widget.focus();
							widget = null;
						}
					} );
				} );
			}
		} );

		editor.on( 'doubleclick', function( evt ) {
			var widget = widgetsRepo.getByElement( evt.data.element );

			// Not in widget or in nested editable.
			if ( !widget || Widget.getNestedEditable( widget.wrapper, evt.data.element ) )
				return;

			return widget.fire( 'doubleclick', { element: evt.data.element } );
		}, null, null, 1 );
	}

	// Setup editor#key observer which will forward it
	// to focused widget.
	function setupKeyboardObserver( widgetsRepo ) {
		var editor = widgetsRepo.editor;

		editor.on( 'key', function( evt ) {
			var focused = widgetsRepo.focused,
				widgetHoldingFocusedEditable = widgetsRepo.widgetHoldingFocusedEditable,
				ret;

			if ( focused )
				ret = focused.fire( 'key', { keyCode: evt.data.keyCode } );
			else if ( widgetHoldingFocusedEditable )
				ret = onEditableKey( widgetHoldingFocusedEditable, evt.data.keyCode );

			return ret;
		}, null, null, 1 );
	}

	// Setup copybin on native copy and cut events in order to handle copy and cut commands
	// if user accepted security alert on IEs.
	// Note: when copying or cutting using keystroke, copySingleWidget will be first executed
	// by the keydown listener. Conflict between two calls will be resolved by copy_bin existence check.
	function setupNativeCutAndCopy( widgetsRepo ) {
		var editor = widgetsRepo.editor;

		editor.on( 'contentDom', function() {
			var editable = editor.editable();

			editable.attachListener( editable, 'copy', eventListener );
			editable.attachListener( editable, 'cut', eventListener );
		} );

		function eventListener( evt ) {
			if ( widgetsRepo.focused )
				copySingleWidget( widgetsRepo.focused, evt.name == 'cut' );
		}
	}

	// Setup selection observer which will trigger:
	// * widget select & focus on selection change,
	// * nested editable focus (related properites and classes) on selection change,
	// * deselecting and blurring all widgets on data,
	// * blurring widget on editor blur.
	function setupSelectionObserver( widgetsRepo ) {
		var editor = widgetsRepo.editor;

		editor.on( 'selectionCheck', function() {
			widgetsRepo.fire( 'checkSelection' );
		} );

		widgetsRepo.on( 'checkSelection', widgetsRepo.checkSelection, widgetsRepo );

		editor.on( 'selectionChange', function( evt ) {
			var nestedEditable = Widget.getNestedEditable( editor.editable(), evt.data.selection.getStartElement() ),
				newWidget = nestedEditable && widgetsRepo.getByElement( nestedEditable ),
				oldWidget = widgetsRepo.widgetHoldingFocusedEditable;

			if ( oldWidget ) {
				if ( oldWidget !== newWidget || !oldWidget.focusedEditable.equals( nestedEditable ) ) {
					setFocusedEditable( widgetsRepo, oldWidget, null );

					if ( newWidget && nestedEditable )
						setFocusedEditable( widgetsRepo, newWidget, nestedEditable );
				}
			}
			// It may happen that there's no widget even if editable was found -
			// e.g. if selection was automatically set in editable although widget wasn't initialized yet.
			else if ( newWidget && nestedEditable ) {
				setFocusedEditable( widgetsRepo, newWidget, nestedEditable );
			}
		} );

		// Invalidate old widgets early - immediately on dataReady.
		editor.on( 'dataReady', function() {
			// Deselect and blur all widgets.
			stateUpdater( widgetsRepo ).commit();
		} );

		editor.on( 'blur', function() {
			var widget;

			if ( ( widget = widgetsRepo.focused ) )
				blurWidget( widgetsRepo, widget );

			if ( ( widget = widgetsRepo.widgetHoldingFocusedEditable ) )
				setFocusedEditable( widgetsRepo, widget, null );
		} );
	}

	// Set up actions like:
	// * processing in toHtml/toDataFormat,
	// * pasting handling,
	// * insertion handling,
	// * editable reload handling (setData, mode switch, undo/redo),
	// * DOM invalidation handling,
	// * widgets checks.
	function setupWidgetsLifecycle( widgetsRepo ) {
		setupWidgetsLifecycleStart( widgetsRepo );
		setupWidgetsLifecycleEnd( widgetsRepo );

		widgetsRepo.on( 'checkWidgets', checkWidgets );
		widgetsRepo.editor.on( 'contentDomInvalidated', widgetsRepo.checkWidgets, widgetsRepo );
	}

	function setupWidgetsLifecycleEnd( widgetsRepo ) {
		var editor = widgetsRepo.editor,
			downcastingSessions = {};

		// Listen before htmlDP#htmlFilter is applied to cache all widgets, because we'll
		// loose data-cke-* attributes.
		editor.on( 'toDataFormat', function( evt ) {
			// To avoid conflicts between htmlDP#toDF calls done at the same time
			// (e.g. nestedEditable#getData called during downcasting some widget)
			// mark every toDataFormat event chain with the downcasting session id.
			var id = CKEDITOR.tools.getNextNumber(),
				toBeDowncasted = [];
			evt.data.downcastingSessionId = id;
			downcastingSessions[ id ] = toBeDowncasted;

			evt.data.dataValue.forEach( function( element ) {
				var attrs = element.attributes,
					widget, widgetElement;

				// Wrapper.
				// Perform first part of downcasting (cleanup) and cache widgets,
				// because after applying DP's filter all data-cke-* attributes will be gone.
				if ( 'data-cke-widget-id' in attrs ) {
					widget = widgetsRepo.instances[ attrs[ 'data-cke-widget-id' ] ];
					if ( widget ) {
						widgetElement = element.getFirst( Widget.isParserWidgetElement );
						toBeDowncasted.push( {
							wrapper: element,
							element: widgetElement,
							widget: widget,
							editables: {}
						} );

						// If widget did not have data-cke-widget attribute before upcasting remove it.
						if ( widgetElement.attributes[ 'data-cke-widget-keep-attr' ] != '1' )
							delete widgetElement.attributes[ 'data-widget' ];
					}
				}
				// Nested editable.
				else if ( 'data-cke-widget-editable' in attrs ) {
					// Save the reference to this nested editable in the closest widget to be downcasted.
					// Nested editables are downcasted in the successive toDataFormat to create an opportunity
					// for dataFilter's "excludeNestedEditable" option to do its job (that option relies on
					// contenteditable="true" attribute) (#11372).
					toBeDowncasted[ toBeDowncasted.length - 1 ].editables[ attrs[ 'data-cke-widget-editable' ] ] = element;

					// Don't check children - there won't be next wrapper or nested editable which we
					// should process in this session.
					return false;
				}
			}, CKEDITOR.NODE_ELEMENT, true );
		}, null, null, 8 );

		// Listen after dataProcessor.htmlFilter and ACF were applied
		// so wrappers securing widgets' contents are removed after all filtering was done.
		editor.on( 'toDataFormat', function( evt ) {
			// Ignore some unmarked sessions.
			if ( !evt.data.downcastingSessionId )
				return;

			var toBeDowncasted = downcastingSessions[ evt.data.downcastingSessionId ],
				toBe, widget, widgetElement, retElement, editableElement, e;

			while ( ( toBe = toBeDowncasted.shift() ) ) {
				widget = toBe.widget;
				widgetElement = toBe.element;
				retElement = widget._.downcastFn && widget._.downcastFn.call( widget, widgetElement );

				// Replace nested editables' content with their output data.
				for ( e in toBe.editables ) {
					editableElement = toBe.editables[ e ];

					delete editableElement.attributes.contenteditable;
					editableElement.setHtml( widget.editables[ e ].getData() );
				}

				// Returned element always defaults to widgetElement.
				if ( !retElement )
					retElement = widgetElement;

				toBe.wrapper.replaceWith( retElement );
			}
		}, null, null, 13 );


		editor.on( 'contentDomUnload', function() {
			widgetsRepo.destroyAll( true );
		} );
	}

	function setupWidgetsLifecycleStart( widgetsRepo ) {
		var editor = widgetsRepo.editor,
			processedWidgetOnly,
			snapshotLoaded;

		// Listen after ACF (so data are filtered),
		// but before dataProcessor.dataFilter was applied (so we can secure widgets' internals).
		editor.on( 'toHtml', function( evt ) {
			var upcastIterator = createUpcastIterator( widgetsRepo ),
				toBeWrapped;

			evt.data.dataValue.forEach( upcastIterator.iterator, CKEDITOR.NODE_ELEMENT, true );

			// Clean up and wrap all queued elements.
			while ( ( toBeWrapped = upcastIterator.toBeWrapped.pop() ) ) {
				cleanUpWidgetElement( toBeWrapped[ 0 ] );
				widgetsRepo.wrapElement( toBeWrapped[ 0 ], toBeWrapped[ 1 ] );
			}

			// Used to determine whether only widget was pasted.
			if ( evt.data.protectedWhitespaces ) {
				// Whitespaces are protected by wrapping content with spans. Take the middle node only.
				processedWidgetOnly = evt.data.dataValue.children.length == 3 &&
					Widget.isParserWidgetWrapper( evt.data.dataValue.children[ 1 ] );
			} else {
				processedWidgetOnly = evt.data.dataValue.children.length == 1 &&
					Widget.isParserWidgetWrapper( evt.data.dataValue.children[ 0 ] );
			}
		}, null, null, 8 );

		editor.on( 'dataReady', function() {
			// Clean up all widgets loaded from snapshot.
			if ( snapshotLoaded )
				cleanUpAllWidgetElements( widgetsRepo, editor.editable() );
			snapshotLoaded = 0;

			// Some widgets were destroyed on contentDomUnload,
			// some on loadSnapshot, but that does not include
			// e.g. setHtml on inline editor or widgets removed just
			// before setting data.
			widgetsRepo.destroyAll( true );
			widgetsRepo.initOnAll();
		} );

		// Set flag so dataReady will know that additional
		// cleanup is needed, because snapshot containing widgets was loaded.
		editor.on( 'loadSnapshot', function( evt ) {
			// Primitive but sufficient check which will prevent from executing
			// heavier cleanUpAllWidgetElements if not needed.
			if ( ( /data-cke-widget/ ).test( evt.data ) )
				snapshotLoaded = 1;

			widgetsRepo.destroyAll( true );
		}, null, null, 9 );

		// Handle pasted single widget.
		editor.on( 'paste', function( evt ) {
			var data = evt.data;

			data.dataValue = data.dataValue.replace( pasteReplaceRegex, pasteReplaceFn );

			// If drag'n'drop kind of paste into nested editable (data.range), selection is set AFTER
			// data is pasted, which means editor has no chance to change activeFilter's context.
			// As a result, pasted data is filtered with default editor's filter instead of NE's and
			// funny things get inserted. Changing the filter by analysis of the paste range below (#13186).
			if ( data.range ) {
				// Check if pasting into nested editable.
				var nestedEditable = Widget.getNestedEditable( editor.editable(), data.range.startContainer );

				if ( nestedEditable ) {
					// Retrieve the filter from NE's data and set it active before editor.insertHtml is done
					// in clipboard plugin.
					var filter = CKEDITOR.filter.instances[ nestedEditable.data( 'cke-filter' ) ];

					if ( filter ) {
						editor.setActiveFilter( filter );
					}
				}
			}
		} );

		// Listen with high priority to check widgets after data was inserted.
		editor.on( 'afterInsertHtml', function( evt ) {
			if ( evt.data.intoRange ) {
				widgetsRepo.checkWidgets( { initOnlyNew: true } );
			} else {
				editor.fire( 'lockSnapshot' );
				// Init only new for performance reason.
				// Focus inited if only widget was processed.
				widgetsRepo.checkWidgets( { initOnlyNew: true, focusInited: processedWidgetOnly } );

				editor.fire( 'unlockSnapshot' );
			}
		} );
	}

	// Helper for coordinating which widgets should be
	// selected/deselected and which one should be focused/blurred.
	function stateUpdater( widgetsRepo ) {
		var currentlySelected = widgetsRepo.selected,
			toBeSelected = [],
			toBeDeselected = currentlySelected.slice( 0 ),
			focused = null;

		return {
			select: function( widget ) {
				if ( CKEDITOR.tools.indexOf( currentlySelected, widget ) < 0 )
					toBeSelected.push( widget );

				var index = CKEDITOR.tools.indexOf( toBeDeselected, widget );
				if ( index >= 0 )
					toBeDeselected.splice( index, 1 );

				return this;
			},

			focus: function( widget ) {
				focused = widget;
				return this;
			},

			commit: function() {
				var focusedChanged = widgetsRepo.focused !== focused,
					widget, isDirty;

				widgetsRepo.editor.fire( 'lockSnapshot' );

				if ( focusedChanged && ( widget = widgetsRepo.focused ) )
					blurWidget( widgetsRepo, widget );

				while ( ( widget = toBeDeselected.pop() ) ) {
					currentlySelected.splice( CKEDITOR.tools.indexOf( currentlySelected, widget ), 1 );
					// Widget could be destroyed in the meantime - e.g. data could be set.
					if ( widget.isInited() ) {
						isDirty = widget.editor.checkDirty();

						widget.setSelected( false );

						!isDirty && widget.editor.resetDirty();
					}
				}

				if ( focusedChanged && focused ) {
					isDirty = widgetsRepo.editor.checkDirty();

					widgetsRepo.focused = focused;
					widgetsRepo.fire( 'widgetFocused', { widget: focused } );
					focused.setFocused( true );

					!isDirty && widgetsRepo.editor.resetDirty();
				}

				while ( ( widget = toBeSelected.pop() ) ) {
					currentlySelected.push( widget );
					widget.setSelected( true );
				}

				widgetsRepo.editor.fire( 'unlockSnapshot' );
			}
		};
	}


	//
	// WIDGET helpers ---------------------------------------------------------
	//

	// LEFT, RIGHT, UP, DOWN, DEL, BACKSPACE - unblock default fake sel handlers.
	var keystrokesNotBlockedByWidget = { 37: 1, 38: 1, 39: 1, 40: 1, 8: 1, 46: 1 };

	// Applies or removes style's classes from widget.
	// @param {CKEDITOR.style} style Custom widget style.
	// @param {Boolean} apply Whether to apply or remove style.
	function applyRemoveStyle( widget, style, apply ) {
		var changed = 0,
			classes = getStyleClasses( style ),
			updatedClasses = widget.data.classes || {},
			cl;

		// Ee... Something is wrong with this style.
		if ( !classes )
			return;

		// Clone, because we need to break reference.
		updatedClasses = CKEDITOR.tools.clone( updatedClasses );

		while ( ( cl = classes.pop() ) ) {
			if ( apply ) {
				if ( !updatedClasses[ cl ] )
					changed = updatedClasses[ cl ] = 1;
			} else {
				if ( updatedClasses[ cl ] ) {
					delete updatedClasses[ cl ];
					changed = 1;
				}
			}
		}
		if ( changed )
			widget.setData( 'classes', updatedClasses );
	}

	function cancel( evt ) {
		evt.cancel();
	}

	function copySingleWidget( widget, isCut ) {
		var editor = widget.editor,
			doc = editor.document;

		// We're still handling previous copy/cut.
		// When keystroke is used to copy/cut this will also prevent
		// conflict with copySingleWidget called again for native copy/cut event.
		if ( doc.getById( 'cke_copybin' ) )
			return;

			// [IE] Use span for copybin and its container to avoid bug with expanding editable height by
			// absolutely positioned element.
		var copybinName = ( editor.blockless || CKEDITOR.env.ie ) ? 'span' : 'div',
			copybin = doc.createElement( copybinName ),
			copybinContainer = doc.createElement( copybinName ),
			// IE8 always jumps to the end of document.
			needsScrollHack = CKEDITOR.env.ie && CKEDITOR.env.version < 9;

		copybinContainer.setAttributes( {
			id: 'cke_copybin',
			'data-cke-temp': '1'
		} );

		// Position copybin element outside current viewport.
		copybin.setStyles( {
			position: 'absolute',
			width: '1px',
			height: '1px',
			overflow: 'hidden'
		} );

		copybin.setStyle( editor.config.contentsLangDirection == 'ltr' ? 'left' : 'right', '-5000px' );

		var range = editor.createRange();
		range.setStartBefore( widget.wrapper );
		range.setEndAfter( widget.wrapper );

		copybin.setHtml(
			'<span data-cke-copybin-start="1">\u200b</span>' +
			editor.editable().getHtmlFromRange( range ).getHtml() +
			'<span data-cke-copybin-end="1">\u200b</span>' );

		// Save snapshot with the current state.
		editor.fire( 'saveSnapshot' );

		// Ignore copybin.
		editor.fire( 'lockSnapshot' );

		copybinContainer.append( copybin );
		editor.editable().append( copybinContainer );

		var listener1 = editor.on( 'selectionChange', cancel, null, null, 0 ),
			listener2 = widget.repository.on( 'checkSelection', cancel, null, null, 0 );

		if ( needsScrollHack ) {
			var docElement = doc.getDocumentElement().$,
				scrollTop = docElement.scrollTop;
		}

		// Once the clone of the widget is inside of copybin, select
		// the entire contents. This selection will be copied by the
		// native browser's clipboard system.
		range = editor.createRange();
		range.selectNodeContents( copybin );
		range.select();

		if ( needsScrollHack )
			docElement.scrollTop = scrollTop;

		setTimeout( function() {
			// [IE] Focus widget before removing copybin to avoid scroll jump.
			if ( !isCut )
				widget.focus();

			copybinContainer.remove();

			listener1.removeListener();
			listener2.removeListener();

			editor.fire( 'unlockSnapshot' );

			if ( isCut ) {
				widget.repository.del( widget );
				editor.fire( 'saveSnapshot' );
			}
		}, 100 ); // Use 100ms, so Chrome (@Mac) will be able to grab the content.
	}

	// Extracts classes array from style instance.
	function getStyleClasses( style ) {
		var attrs = style.getDefinition().attributes,
			classes = attrs && attrs[ 'class' ];

		return classes ? classes.split( /\s+/ ) : null;
	}

	// [IE] Force keeping focus because IE sometimes forgets to fire focus on main editable
	// when blurring nested editable.
	// @context widget
	function onEditableBlur() {
		var active = CKEDITOR.document.getActive(),
			editor = this.editor,
			editable = editor.editable();

		// If focus stays within editor override blur and set currentActive because it should be
		// automatically changed to editable on editable#focus but it is not fired.
		if ( ( editable.isInline() ? editable : editor.document.getWindow().getFrame() ).equals( active ) )
			editor.focusManager.focus( editable );
	}

	// Force selectionChange when editable was focused.
	// Similar to hack in selection.js#~620.
	// @context widget
	function onEditableFocus() {
		// Gecko does not support 'DOMFocusIn' event on which we unlock selection
		// in selection.js to prevent selection locking when entering nested editables.
		if ( CKEDITOR.env.gecko )
			this.editor.unlockSelection();

		// We don't need to force selectionCheck on Webkit, because on Webkit
		// we do that on DOMFocusIn in selection.js.
		if ( !CKEDITOR.env.webkit ) {
			this.editor.forceNextSelectionCheck();
			this.editor.selectionChange( 1 );
		}
	}

	// Setup listener on widget#data which will update (remove/add) classes
	// by comparing newly set classes with the old ones.
	function setupDataClassesListener( widget ) {
		// Note: previousClasses and newClasses may be null!
		// Tip: for ( cl in null ) is correct.
		var previousClasses = null;

		widget.on( 'data', function() {
			var newClasses = this.data.classes,
				cl;

			// When setting new classes one need to remember
			// that he must break reference.
			if ( previousClasses == newClasses )
				return;

			for ( cl in previousClasses ) {
				// Avoid removing and adding classes again.
				if ( !( newClasses && newClasses[ cl ] ) )
					this.removeClass( cl );
			}
			for ( cl in newClasses )
				this.addClass( cl );

			previousClasses = newClasses;
		} );
	}

	function setupDragHandler( widget ) {
		if ( !widget.draggable )
			return;

		var editor = widget.editor,
			// Use getLast to find wrapper's direct descendant (#12022).
			container = widget.wrapper.getLast( Widget.isDomDragHandlerContainer ),
			img;

		// Reuse drag handler if already exists (#11281).
		if ( container )
			img = container.findOne( 'img' );
		else {
			container = new CKEDITOR.dom.element( 'span', editor.document );
			container.setAttributes( {
				'class': 'cke_reset cke_widget_drag_handler_container',
				// Split background and background-image for IE8 which will break on rgba().
				style: 'background:rgba(220,220,220,0.5);background-image:url(' + editor.plugins.widget.path + 'images/handle.png)'
			} );

			img = new CKEDITOR.dom.element( 'img', editor.document );
			img.setAttributes( {
				'class': 'cke_reset cke_widget_drag_handler',
				'data-cke-widget-drag-handler': '1',
				src: CKEDITOR.tools.transparentImageData,
				width: DRAG_HANDLER_SIZE,
				title: editor.lang.widget.move,
				height: DRAG_HANDLER_SIZE
			} );
			widget.inline && img.setAttribute( 'draggable', 'true' );

			container.append( img );
			widget.wrapper.append( container );
		}

		// Preventing page reload when dropped content on widget wrapper (#13015).
		// Widget is not editable so by default drop on it isn't allowed what means that
		// browser handles it (there's no editable#drop event). If there's no drop event we cannot block
		// the drop, so page is reloaded. This listener enables drop on widget wrappers.
		widget.wrapper.on( 'dragover', function( evt ) {
			evt.data.preventDefault();
		} );

		widget.wrapper.on( 'mouseenter', widget.updateDragHandlerPosition, widget );
		setTimeout( function() {
			widget.on( 'data', widget.updateDragHandlerPosition, widget );
		}, 50 );

		if ( !widget.inline ) {
			img.on( 'mousedown', onBlockWidgetDrag, widget );

			// On IE8 'dragstart' is propagated to editable, so editor#dragstart is fired twice on block widgets.
			if ( CKEDITOR.env.ie && CKEDITOR.env.version < 9 ) {
				img.on( 'dragstart', function( evt ) {
					evt.data.preventDefault( true );
				} );
			}
		}

		widget.dragHandlerContainer = container;
	}

	function onBlockWidgetDrag( evt ) {
		var finder = this.repository.finder,
			locator = this.repository.locator,
			liner = this.repository.liner,
			editor = this.editor,
			editable = editor.editable(),
			listeners = [],
			sorted = [],
			locations,
			y;

		// Mark dragged widget for repository#finder.
		this.repository._.draggedWidget = this;

		// Harvest all possible relations and display some closest.
		var relations = finder.greedySearch(),

			buffer = CKEDITOR.tools.eventsBuffer( 50, function() {
				locations = locator.locate( relations );

				// There's only a single line displayed for D&D.
				sorted = locator.sort( y, 1 );

				if ( sorted.length ) {
					liner.prepare( relations, locations );
					liner.placeLine( sorted[ 0 ] );
					liner.cleanup();
				}
			} );

		// Let's have the "dragging cursor" over entire editable.
		editable.addClass( 'cke_widget_dragging' );

		// Cache mouse position so it is re-used in events buffer.
		listeners.push( editable.on( 'mousemove', function( evt ) {
			y = evt.data.$.clientY;
			buffer.input();
		} ) );

		// Fire drag start as it happens during the native D&D.
		editor.fire( 'dragstart', { target: evt.sender } );

		function onMouseUp() {
			var l;

			buffer.reset();

			// Stop observing events.
			while ( ( l = listeners.pop() ) )
				l.removeListener();

			onBlockWidgetDrop.call( this, sorted, evt.sender );
		}

		// Mouseup means "drop". This is when the widget is being detached
		// from DOM and placed at range determined by the line (location).
		listeners.push( editor.document.once( 'mouseup', onMouseUp, this ) );

		// Prevent calling 'onBlockWidgetDrop' twice in the inline editor.
		// `removeListener` does not work if it is called at the same time event is fired.
		if ( !editable.isInline() ) {
			// Mouseup may occur when user hovers the line, which belongs to
			// the outer document. This is, of course, a valid listener too.
			listeners.push( CKEDITOR.document.once( 'mouseup', onMouseUp, this ) );
		}
	}

	function onBlockWidgetDrop( sorted, dragTarget ) {
		var finder = this.repository.finder,
			liner = this.repository.liner,
			editor = this.editor,
			editable = this.editor.editable();

		if ( !CKEDITOR.tools.isEmpty( liner.visible ) ) {
			// Retrieve range for the closest location.
			var dropRange = finder.getRange( sorted[ 0 ] );

			// Focus widget (it could lost focus after mousedown+mouseup)
			// and save this state as the one where we want to be taken back when undoing.
			this.focus();

			// Drag range will be set in the drop listener.
			editor.fire( 'drop', {
				dropRange: dropRange,
				target: dropRange.startContainer
			} );
		}

		// Clean-up custom cursor for editable.
		editable.removeClass( 'cke_widget_dragging' );

		// Clean-up all remaining lines.
		liner.hideVisible();

		// Clean-up drag & drop.
		editor.fire( 'dragend', { target: dragTarget } );
	}

	function setupEditables( widget ) {
		var editableName,
			editableDef,
			definedEditables = widget.editables;

		widget.editables = {};

		if ( !widget.editables )
			return;

		for ( editableName in definedEditables ) {
			editableDef = definedEditables[ editableName ];
			widget.initEditable( editableName, typeof editableDef == 'string' ? { selector: editableDef } : editableDef );
		}
	}

	function setupMask( widget ) {
		if ( !widget.mask )
			return;

		// Reuse mask if already exists (#11281).
		var img = widget.wrapper.findOne( '.cke_widget_mask' );

		if ( !img ) {
			img = new CKEDITOR.dom.element( 'img', widget.editor.document );
			img.setAttributes( {
				src: CKEDITOR.tools.transparentImageData,
				'class': 'cke_reset cke_widget_mask'
			} );
			widget.wrapper.append( img );
		}

		widget.mask = img;
	}

	// Replace parts object containing:
	// partName => selector pairs
	// with:
	// partName => element pairs
	function setupParts( widget ) {
		if ( widget.parts ) {
			var parts = {},
				el, partName;

			for ( partName in widget.parts ) {
				el = widget.wrapper.findOne( widget.parts[ partName ] );
				parts[ partName ] = el;
			}
			widget.parts = parts;
		}
	}

	function setupWidget( widget, widgetDef ) {
		setupWrapper( widget );
		setupParts( widget );
		setupEditables( widget );
		setupMask( widget );
		setupDragHandler( widget );
		setupDataClassesListener( widget );

		// #11145: [IE8] Non-editable content of widget is draggable.
		if ( CKEDITOR.env.ie && CKEDITOR.env.version < 9 ) {
			widget.wrapper.on( 'dragstart', function( evt ) {
				var target = evt.data.getTarget();

				// Allow text dragging inside nested editables or dragging inline widget's drag handler.
				if ( !Widget.getNestedEditable( widget, target ) && !( widget.inline && Widget.isDomDragHandler( target ) ) )
					evt.data.preventDefault();
			} );
		}

		widget.wrapper.removeClass( 'cke_widget_new' );
		widget.element.addClass( 'cke_widget_element' );

		widget.on( 'key', function( evt ) {
			var keyCode = evt.data.keyCode;

			// ENTER.
			if ( keyCode == 13 ) {
				widget.edit();
				// CTRL+C or CTRL+X.
			} else if ( keyCode == CKEDITOR.CTRL + 67 || keyCode == CKEDITOR.CTRL + 88 ) {
				copySingleWidget( widget, keyCode == CKEDITOR.CTRL + 88 );
				return; // Do not preventDefault.
			} else if ( keyCode in keystrokesNotBlockedByWidget || ( CKEDITOR.CTRL & keyCode ) || ( CKEDITOR.ALT & keyCode ) ) {
				// Pass chosen keystrokes to other plugins or default fake sel handlers.
				// Pass all CTRL/ALT keystrokes.
				return;
			}

			return false;
		}, null, null, 999 );
		// Listen with high priority so it's possible
		// to overwrite this callback.

		widget.on( 'doubleclick', function( evt ) {
			if ( widget.edit() ) {
				// We have to cancel event if edit method opens a dialog, otherwise
				// link plugin may open extra dialog (#12140).
				evt.cancel();
			}
		} );

		if ( widgetDef.data )
			widget.on( 'data', widgetDef.data );

		if ( widgetDef.edit )
			widget.on( 'edit', widgetDef.edit );
	}

	function setupWidgetData( widget, startupData ) {
		var widgetDataAttr = widget.element.data( 'cke-widget-data' );

		if ( widgetDataAttr )
			widget.setData( JSON.parse( decodeURIComponent( widgetDataAttr ) ) );
		if ( startupData )
			widget.setData( startupData );

		// Populate classes if they are not preset.
		if ( !widget.data.classes )
			widget.setData( 'classes', widget.getClasses() );

		// Unblock data and...
		widget.dataReady = true;

		// Write data to element because this was blocked when data wasn't ready.
		writeDataToElement( widget );

		// Fire data event first time, because this was blocked when data wasn't ready.
		widget.fire( 'data', widget.data );
	}

	function setupWrapper( widget ) {
		// Retrieve widget wrapper. Assign an id to it.
		var wrapper = widget.wrapper = widget.element.getParent();
		wrapper.setAttribute( 'data-cke-widget-id', widget.id );
	}

	function writeDataToElement( widget ) {
		widget.element.data( 'cke-widget-data', encodeURIComponent( JSON.stringify( widget.data ) ) );
	}

	//
	// WIDGET STYLE HANDLER ---------------------------------------------------
	//

	( function() {

		
		CKEDITOR.style.addCustomHandler( {
			type: 'widget',

			setup: function( styleDefinition ) {
				
				this.widget = styleDefinition.widget;
			},

			apply: function( editor ) {
				// Before CKEditor 4.4 wasn't a required argument, so we need to
				// handle a case when it wasn't provided.
				if ( !( editor instanceof CKEDITOR.editor ) )
					return;

				// Theoretically we could bypass checkApplicable, get widget from
				// widgets.focused and check its name, what would be faster, but then
				// this custom style would work differently than the default style
				// which checks if it's applicable before applying or removeing itself.
				if ( this.checkApplicable( editor.elementPath(), editor ) )
					editor.widgets.focused.applyStyle( this );
			},

			remove: function( editor ) {
				// Before CKEditor 4.4 wasn't a required argument, so we need to
				// handle a case when it wasn't provided.
				if ( !( editor instanceof CKEDITOR.editor ) )
					return;

				if ( this.checkApplicable( editor.elementPath(), editor ) )
					editor.widgets.focused.removeStyle( this );
			},

			checkActive: function( elementPath, editor ) {
				return this.checkElementMatch( elementPath.lastElement, 0, editor );
			},

			checkApplicable: function( elementPath, editor ) {
				// Before CKEditor 4.4 wasn't a required argument, so we need to
				// handle a case when it wasn't provided.
				if ( !( editor instanceof CKEDITOR.editor ) )
					return false;

				return this.checkElement( elementPath.lastElement );
			},

			checkElementMatch: checkElementMatch,

			checkElementRemovable: checkElementMatch,

			
			checkElement: function( element ) {
				if ( !Widget.isDomWidgetWrapper( element ) )
					return false;

				var widgetElement = element.getFirst( Widget.isDomWidgetElement );
				return widgetElement && widgetElement.data( 'widget' ) == this.widget;
			},

			buildPreview: function( label ) {
				return label || this._.definition.name;
			},

			
			toAllowedContentRules: function( editor ) {
				if ( !editor )
					return null;

				var widgetDef = editor.widgets.registered[ this.widget ],
					classes,
					rule = {};

				if ( !widgetDef )
					return null;

				if ( widgetDef.styleableElements ) {
					classes = this.getClassesArray();
					if ( !classes )
						return null;

					rule[ widgetDef.styleableElements ] = {
						classes: classes,
						propertiesOnly: true
					};
					return rule;
				}
				if ( widgetDef.styleToAllowedContentRules )
					return widgetDef.styleToAllowedContentRules( this );
				return null;
			},

			
			getClassesArray: function() {
				var classes = this._.definition.attributes && this._.definition.attributes[ 'class' ];

				return classes ? CKEDITOR.tools.trim( classes ).split( /\s+/ ) : null;
			},

			
			applyToRange: notImplemented,

			
			removeFromRange: notImplemented,

			
			applyToObject: notImplemented
		} );

		function notImplemented() {}

		// @context style
		function checkElementMatch( element, fullMatch, editor ) {
			// Before CKEditor 4.4 wasn't a required argument, so we need to
			// handle a case when it wasn't provided.
			if ( !editor )
				return false;

			if ( !this.checkElement( element ) )
				return false;

			var widget = editor.widgets.getByElement( element, true );
			return widget && widget.checkStyleActive( this );
		}

	} )();

	//
	// EXPOSE PUBLIC API ------------------------------------------------------
	//

	CKEDITOR.plugins.widget = Widget;
	Widget.repository = Repository;
	Widget.nestedEditable = NestedEditable;
} )();
























































