



if ( !CKEDITOR.event ) {
	
	CKEDITOR.event = function() {};

	
	CKEDITOR.event.implementOn = function( targetObject ) {
		var eventProto = CKEDITOR.event.prototype;

		for ( var prop in eventProto ) {
			if ( targetObject[ prop ] == null )
				targetObject[ prop ] = eventProto[ prop ];
		}
	};

	CKEDITOR.event.prototype = ( function() {
		// Returns the private events object for a given object.
		var getPrivate = function( obj ) {
				var _ = ( obj.getPrivate && obj.getPrivate() ) || obj._ || ( obj._ = {} );
				return _.events || ( _.events = {} );
			};

		var eventEntry = function( eventName ) {
				this.name = eventName;
				this.listeners = [];
			};

		eventEntry.prototype = {
			// Get the listener index for a specified function.
			// Returns -1 if not found.
			getListenerIndex: function( listenerFunction ) {
				for ( var i = 0, listeners = this.listeners; i < listeners.length; i++ ) {
					if ( listeners[ i ].fn == listenerFunction )
						return i;
				}
				return -1;
			}
		};

		// Retrieve the event entry on the event host (create it if needed).
		function getEntry( name ) {
			// Get the event entry (create it if needed).
			var events = getPrivate( this );
			return events[ name ] || ( events[ name ] = new eventEntry( name ) );
		}

		return {
			
			define: function( name, meta ) {
				var entry = getEntry.call( this, name );
				CKEDITOR.tools.extend( entry, meta, true );
			},

			
			on: function( eventName, listenerFunction, scopeObj, listenerData, priority ) {
				// Create the function to be fired for this listener.
				function listenerFirer( editor, publisherData, stopFn, cancelFn ) {
					var ev = {
						name: eventName,
						sender: this,
						editor: editor,
						data: publisherData,
						listenerData: listenerData,
						stop: stopFn,
						cancel: cancelFn,
						removeListener: removeListener
					};

					var ret = listenerFunction.call( scopeObj, ev );

					return ret === false ? false : ev.data;
				}

				function removeListener() {
					me.removeListener( eventName, listenerFunction );
				}

				var event = getEntry.call( this, eventName );

				if ( event.getListenerIndex( listenerFunction ) < 0 ) {
					// Get the listeners.
					var listeners = event.listeners;

					// Fill the scope.
					if ( !scopeObj )
						scopeObj = this;

					// Default the priority, if needed.
					if ( isNaN( priority ) )
						priority = 10;

					var me = this;

					listenerFirer.fn = listenerFunction;
					listenerFirer.priority = priority;

					// Search for the right position for this new listener, based on its
					// priority.
					for ( var i = listeners.length - 1; i >= 0; i-- ) {
						// Find the item which should be before the new one.
						if ( listeners[ i ].priority <= priority ) {
							// Insert the listener in the array.
							listeners.splice( i + 1, 0, listenerFirer );
							return { removeListener: removeListener };
						}
					}

					// If no position has been found (or zero length), put it in
					// the front of list.
					listeners.unshift( listenerFirer );
				}

				return { removeListener: removeListener };
			},

			
			once: function() {
				var args = Array.prototype.slice.call( arguments ),
					fn = args[ 1 ];

				args[ 1 ] = function( evt ) {
					evt.removeListener();
					return fn.apply( this, arguments );
				};

				return this.on.apply( this, args );
			},

			

			
			capture: function() {
				CKEDITOR.event.useCapture = 1;
				var retval = this.on.apply( this, arguments );
				CKEDITOR.event.useCapture = 0;
				return retval;
			},

			
			fire: ( function() {
				// Create the function that marks the event as stopped.
				var stopped = 0;
				var stopEvent = function() {
						stopped = 1;
					};

				// Create the function that marks the event as canceled.
				var canceled = 0;
				var cancelEvent = function() {
						canceled = 1;
					};

				return function( eventName, data, editor ) {
					// Get the event entry.
					var event = getPrivate( this )[ eventName ];

					// Save the previous stopped and cancelled states. We may
					// be nesting fire() calls.
					var previousStopped = stopped,
						previousCancelled = canceled;

					// Reset the stopped and canceled flags.
					stopped = canceled = 0;

					if ( event ) {
						var listeners = event.listeners;

						if ( listeners.length ) {
							// As some listeners may remove themselves from the
							// event, the original array length is dinamic. So,
							// let's make a copy of all listeners, so we are
							// sure we'll call all of them.
							listeners = listeners.slice( 0 );

							var retData;
							// Loop through all listeners.
							for ( var i = 0; i < listeners.length; i++ ) {
								// Call the listener, passing the event data.
								if ( event.errorProof ) {
									try {
										retData = listeners[ i ].call( this, editor, data, stopEvent, cancelEvent );
									} catch ( er ) {}
								} else {
									retData = listeners[ i ].call( this, editor, data, stopEvent, cancelEvent );
								}

								if ( retData === false )
									canceled = 1;
								else if ( typeof retData != 'undefined' )
									data = retData;

								// No further calls is stopped or canceled.
								if ( stopped || canceled )
									break;
							}
						}
					}

					var ret = canceled ? false : ( typeof data == 'undefined' ? true : data );

					// Restore the previous stopped and canceled states.
					stopped = previousStopped;
					canceled = previousCancelled;

					return ret;
				};
			} )(),

			
			fireOnce: function( eventName, data, editor ) {
				var ret = this.fire( eventName, data, editor );
				delete getPrivate( this )[ eventName ];
				return ret;
			},

			
			removeListener: function( eventName, listenerFunction ) {
				// Get the event entry.
				var event = getPrivate( this )[ eventName ];

				if ( event ) {
					var index = event.getListenerIndex( listenerFunction );
					if ( index >= 0 )
						event.listeners.splice( index, 1 );
				}
			},

			
			removeAllListeners: function() {
				var events = getPrivate( this );
				for ( var i in events )
					delete events[ i ];
			},

			
			hasListeners: function( eventName ) {
				var event = getPrivate( this )[ eventName ];
				return ( event && event.listeners.length > 0 );
			}
		};
	} )();
}
